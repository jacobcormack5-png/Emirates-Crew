import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const supabaseAuth = () =>
  createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

export default async function handler(request, response) {
  if (request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });
  if (
    !process.env.EMIRATES_BOT_URL ||
    !process.env.PORTAL_API_SECRET ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  )
    return response
      .status(503)
      .json({ error: "Role integration is not configured" });

  const accessToken = String(request.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  const discordId = String(request.query.discordId || "").trim();
  if (!accessToken)
    return response.status(401).json({
      error: "Your portal session is missing. Please sign in again.",
    });

  const admin = supabaseAdmin();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth().auth.getUser(accessToken);
  if (authError || !user) {
    console.error("Role refresh session validation failed", authError?.message);
    return response.status(401).json({
      error: "Your portal session expired. Please sign out and sign in again.",
    });
  }

  const { data: profile } = await admin
    .from("crew_profiles")
    .select("discord_id,portal_role")
    .eq("id", user.id)
    .single();
  const oauthDiscordId =
    user.user_metadata?.provider_id || user.user_metadata?.sub;
  if (
    profile?.portal_role !== "admin" &&
    discordId !== profile?.discord_id &&
    discordId !== oauthDiscordId
  )
    return response
      .status(403)
      .json({ error: "You can only refresh your own Discord roles" });

  const upstream = await fetch(
    `${process.env.EMIRATES_BOT_URL.replace(/\/$/, "")}/api/roles?discordId=${encodeURIComponent(discordId)}`,
    { headers: { authorization: `Bearer ${process.env.PORTAL_API_SECRET}` } },
  ).catch(() => null);
  if (!upstream)
    return response.status(502).json({ error: "Emirates bot is unavailable" });
  const data = await upstream
    .json()
    .catch(() => ({ error: "Invalid bot response" }));

  if (upstream.ok && Array.isArray(data.roles)) {
    const discoveredRoles = data.roles
      .map((name, index) => ({
        name: String(name || "").trim(),
        discord_role_id: data.roleIds?.[index]
          ? String(data.roleIds[index])
          : null,
      }))
      .filter((role) => role.name.length >= 1 && role.name.length <= 100);
    const { data: existingRoleRows } = await admin
      .from("portal_roles")
      .select("id,name,discord_role_id");
    const existingRoles = existingRoleRows || [];
    for (const role of discoveredRoles) {
      const existing = (existingRoles || []).find(
        (candidate) =>
          (role.discord_role_id &&
            candidate.discord_role_id === role.discord_role_id) ||
          candidate.name.toLowerCase() === role.name.toLowerCase(),
      );
      if (existing) {
        if (!existing.discord_role_id && role.discord_role_id)
          await admin
            .from("portal_roles")
            .update({ discord_role_id: role.discord_role_id })
            .eq("id", existing.id);
        continue;
      }
      const { data: createdRole, error: roleError } = await admin
        .from("portal_roles")
        .insert({
          name: role.name,
          discord_role_id: role.discord_role_id,
          permissions: [],
          source: "discord",
          created_by: null,
        })
        .select("id,name,discord_role_id")
        .single();
      if (roleError)
        console.error(
          "Could not add Discord role to portal",
          role.name,
          roleError.message,
        );
      else existingRoles.push(createdRole);
    }
    await admin
      .from("crew_profiles")
      .update({
        discord_roles: data.roles,
        rank_name: data.primaryRole || "Crew Member",
      })
      .eq("id", user.id);
  }
  return response.status(upstream.status).json(data);
}
