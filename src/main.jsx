import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  CalendarDays,
  Palmtree,
  FolderClosed,
  FileText,
  Binoculars,
  Menu,
  X,
  ArrowUpRight,
  Plane,
  ChevronRight,
  Search,
  Plus,
  ShieldCheck,
  PlaneTakeoff,
  ShieldAlert,
  Settings2,
  Users,
  Save,
  Trash2,
  Check,
  SlidersHorizontal,
  RefreshCw,
  UserCircle,
} from "lucide-react";
import "./styles.css";
import { supabase, supabaseConfigured } from "./supabase";

const nav = [
  ["Dashboard", LayoutDashboard],
  ["Allocations", CalendarDays],
  ["Absence", Palmtree],
  ["Records", FolderClosed],
  ["Documentation", FileText],
  ["Vacancies", Binoculars],
  ["Operations", PlaneTakeoff],
  ["Disciplinary", ShieldAlert],
  ["Portal Management", Settings2],
];
const initialRoles = [
  {
    name: "Chief Operations Officer",
    members: 1,
    permissions: ["Schedule flights", "Manage discipline", "Manage portal"],
  },
  { name: "Flight Dispatcher", members: 3, permissions: ["Schedule flights"] },
  { name: "Cabin Crew", members: 24, permissions: [] },
];
const dutyGroups = [
  {
    title: "Supervisory Duties",
    roles: [
      ["Flight Supervisor", 2],
      ["Cabin Services Manager", 1],
      ["Turnaround Coordinator", 1],
      ["Safety Coordinator", 1],
      ["Flight Deck Supervisor", 1],
      ["Duty Manager", 1],
    ],
  },
  {
    title: "Departmental Duties",
    roles: [
      ["Captain", 1],
      ["First Officer", 1],
      ["Cabin Services", 6],
      ["Airside Operations", 3],
      ["Personal Assistant", 2],
      ["Customer Assistance", 4],
    ],
  },
];
function App() {
  const [session, setSession] = useState(undefined);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null);
      return;
    }
    const finishSignIn = (nextSession) => {
      setSession(nextSession);
      if (nextSession && window.location.pathname !== "/dashboard") {
        window.history.replaceState({}, document.title, "/dashboard");
      }
    };
    let restoring = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession || !restoring) finishSignIn(nextSession);
      if (event === "SIGNED_IN")
        window.scrollTo({ top: 0, behavior: "instant" });
    });
    const restoreSession = async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (window.location.pathname === "/auth/callback" && code) {
        const { data, error } =
          await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session) {
          restoring = false;
          return finishSignIn(data.session);
        }
        console.error("Discord sign-in callback failed", error);
        restoring = false;
        setSession(null);
        setAuthError(
          error?.message || "Discord returned without a usable session.",
        );
        return;
      }

      const { data: current } = await supabase.auth.getSession();
      if (current.session) {
        restoring = false;
        return finishSignIn(current.session);
      }
      restoring = false;
      finishSignIn(null);
    };
    restoreSession();
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined)
    return <div className="auth-loading">Loading Emirates Crew…</div>;
  if (authError)
    return (
      <div className="auth-loading callback-error">
        <strong>Discord sign-in could not be completed.</strong>
        <span>{authError}</span>
        <a href="/">Return to sign in</a>
      </div>
    );
  if (!session) return <Landing />;
  return <PortalApp session={session} />;
}

function Landing() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signIn = async () => {
    if (!supabaseConfigured) {
      setError(
        "The Emirates Supabase project has not been connected to this deployment yet.",
      );
      return;
    }
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  };
  return (
    <main className="landing">
      <div className="landing-glow" />
      <header className="landing-nav">
        <Logo />
        <span>Personnel Operations</span>
      </header>
      <section className="landing-copy">
        <p>EMIRATES CREW PORTAL</p>
        <h1>
          Your roster.
          <br />
          Your operations.
          <br />
          <em>One place.</em>
        </h1>
        <span>
          Sign in securely with Discord to view allocations, request leave and
          manage your Emirates Virtual crew profile.
        </span>
        <button className="discord-button" onClick={signIn} disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.5 5.3A16 16 0 0 0 15.4 4l-.5 1a14 14 0 0 0-5.8 0l-.5-1a16 16 0 0 0-4.1 1.3C1.9 9.2 1.2 13 1.5 16.8A16.5 16.5 0 0 0 6.6 19l1.2-1.7-1.8-.9.4-.3c3.6 1.7 7.6 1.7 11.2 0l.4.3-1.8.9 1.2 1.7a16.5 16.5 0 0 0 5.1-2.2c.4-4.4-.8-8.2-3-11.5ZM8.7 14.6c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm6.6 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z" />
          </svg>
          {busy ? "Redirecting…" : "Sign in with Discord"}
        </button>
        {error && <div className="auth-error">{error}</div>}
      </section>
      <div className="landing-plane">
        <img src="/emirates-a350.jpg" alt="Emirates aircraft" />
      </div>
    </main>
  );
}

function PortalApp({ session }) {
  const [page, setPage] = useState("Dashboard"),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [flights, setFlights] = useState([]),
    [balance, setBalance] = useState(0),
    [absence, setAbsence] = useState(false),
    [discipline, setDiscipline] = useState([]),
    [roles, setRoles] = useState(initialRoles),
    [profileOpen, setProfileOpen] = useState(false),
    [rpName, setRpName] = useState("Jakele7"),
    [discordId, setDiscordId] = useState(""),
    [discordRoles, setDiscordRoles] = useState([]),
    [crewMembers, setCrewMembers] = useState([]);
  const notify = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };
  useEffect(() => {
    const load = async () => {
      const [
        { data: profile },
        { data: flightRows },
        { data: recordRows },
        { data: loaRows },
        { data: profileRows },
      ] = await Promise.all([
        supabase
          .from("crew_profiles")
          .select("*")
          .eq("id", session.user.id)
          .single(),
        supabase
          .from("flights")
          .select("*, flight_allocations(*)")
          .in("status", ["scheduled", "boarding"])
          .order("departure_at"),
        supabase
          .from("disciplinary_actions")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("loa_requests")
          .select("id,status")
          .eq("user_id", session.user.id)
          .eq("status", "pending"),
        supabase
          .from("crew_profiles")
          .select("id,rp_name,rank_name,discord_username")
          .order("rp_name"),
      ]);
      if (profile) {
        setRpName(profile.rp_name);
        setDiscordId(profile.discord_id || "");
        setDiscordRoles(profile.discord_roles || []);
        setBalance(profile.total_pay || 0);
      }
      setFlights(
        (flightRows || []).map((flight) => ({
          id: flight.id,
          code: flight.code,
          origin: flight.origin,
          destination: flight.destination,
          date: new Date(flight.departure_at).toLocaleDateString("en-GB"),
          time: new Date(flight.departure_at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          aircraft: flight.aircraft,
          assignments: Object.fromEntries(
            (flight.flight_allocations || []).map((a) => [
              `${a.duty_role}:${a.slot_number - 1}`,
              a.user_id === session.user.id
                ? profile?.rp_name || "You"
                : "Crew member",
            ]),
          ),
        })),
      );
      setDiscipline(
        (recordRows || []).map((item) => ({
          id: item.id,
          type: item.action_type[0].toUpperCase() + item.action_type.slice(1),
          reason: item.reason,
          date: new Date(item.created_at).toLocaleDateString("en-GB"),
          issuer: "Emirates Management",
        })),
      );
      setAbsence(Boolean(loaRows?.length));
      setCrewMembers(profileRows || []);
    };
    load().catch(() => notify("Could not load your Supabase crew record"));
  }, [session.user.id]);
  return (
    <div className="app">
      <aside className={mobile ? "open" : ""}>
        <div className="side-head">
          <Logo />
          <button
            aria-label="Close navigation"
            className="icon-btn close"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>
        <nav>
          {nav.map(([n, I]) => (
            <button
              key={n}
              className={page === n ? "active" : ""}
              onClick={() => {
                setPage(n);
                setMobile(false);
              }}
            >
              <I />
              <span>{n}</span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="status-dot" />
          <span>Operations online</span>
        </div>
      </aside>
      <main>
        <header>
          <button
            aria-label="Open navigation"
            className="icon-btn menu"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div>
            <p>EMIRATES CREW</p>
            <h1>{page}</h1>
          </div>
          <button
            className="user user-button"
            onClick={() => setProfileOpen(true)}
          >
            <div>
              <strong>{rpName}</strong>
              <span>Chief Operations Officer · Profile</span>
            </div>
            <div className="avatar">{rpName.slice(0, 2).toUpperCase()}</div>
          </button>
        </header>
        {page === "Dashboard" ? (
          <Dashboard
            go={setPage}
            rpName={rpName}
            flights={flights}
            balance={balance}
            absence={absence}
            discipline={discipline}
          />
        ) : (
          <Page
            name={page}
            flights={flights}
            setFlights={setFlights}
            balance={balance}
            setBalance={setBalance}
            absence={absence}
            setAbsence={setAbsence}
            discipline={discipline}
            setDiscipline={setDiscipline}
            roles={roles}
            setRoles={setRoles}
            discordId={discordId}
            notify={notify}
            userId={session.user.id}
            rpName={rpName}
            crewMembers={crewMembers}
          />
        )}
      </main>
      {profileOpen && (
        <ProfileModal
          rpName={rpName}
          setRpName={setRpName}
          discordId={discordId}
          setDiscordId={setDiscordId}
          roles={discordRoles}
          setRoles={setDiscordRoles}
          close={() => setProfileOpen(false)}
          notify={notify}
          userId={session.user.id}
        />
      )}
      {toast && (
        <div className="toast">
          <Check />
          {toast}
        </div>
      )}
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark" aria-hidden="true">
        <span>EK</span>
        <i />
      </div>
      <div>
        Emirates Crew<small>Operations Portal</small>
      </div>
    </div>
  );
}
function Chip({ children, tone = "" }) {
  return <span className={"chip " + tone}>{children}</span>;
}
function Dashboard({ go, rpName, flights, balance, absence, discipline }) {
  const completed = balance / 20,
    upcoming = flights;
  return (
    <div className="dashboard">
      <section className="hero">
        <img src="/emirates-a350.jpg" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <Chip>CREW PROFILE</Chip>
          <h2>
            Welcome back,
            <br />
            {rpName}.
          </h2>
          <p>Chief Operations Officer · Emirates Virtual</p>
        </div>
        <div className="pay">
          <span>TOTAL PAY</span>
          <strong>R${balance}</strong>
        </div>
      </section>
      <div className="quick-grid">
        <Quick
          n={absence ? 1 : 0}
          label="Pending absence requests"
          action="Request absence"
          onClick={() => go("Absence")}
        />
        <Quick
          n={flights.length}
          label="Open allocations"
          action="Browse flights"
          onClick={() => go("Allocations")}
        />
        <Quick
          n={discipline.length}
          label="Disciplinary actions"
          action="View records"
          onClick={() => go("Records")}
        />
        <Quick
          n="0"
          label="Internal vacancies"
          action="View roles"
          onClick={() => go("Vacancies")}
        />
      </div>
      <section className="panel docs">
        <div className="section-title">
          <div>
            <p>CREW RESOURCES</p>
            <h3>Internal documentation</h3>
          </div>
          <button onClick={() => go("Documentation")}>
            View library <ArrowUpRight />
          </button>
        </div>
        <div className="docs-empty">
          Documents shared with your crew role will appear here.
        </div>
      </section>
      <aside className="rail">
        <section className="panel next">
          <p className="eyebrow">YOUR NEXT FLIGHT</p>
          <div className="plane-icon">
            <Plane />
          </div>
          {upcoming[0] ? (
            <>
              <h3>{upcoming[0].code}</h3>
              <p>
                {upcoming[0].origin} → {upcoming[0].destination}
              </p>
              <button onClick={() => go("Allocations")}>View allocation</button>
            </>
          ) : (
            <>
              <h3>No allocated flights</h3>
              <p>You haven’t been allocated to any open flights.</p>
              <button onClick={() => go("Allocations")}>
                Browse current flights
              </button>
            </>
          )}
        </section>
        <section className="panel quota">
          <div className="section-title">
            <div>
              <p>MONTHLY QUOTA</p>
              <h3>November progress</h3>
            </div>
            <strong>{completed}/4</strong>
          </div>
          <div className="progress">
            <i style={{ width: `${Math.min((completed / 4) * 100, 100)}%` }} />
          </div>
          <div className="quota-stats">
            <div>
              <strong>{completed}</strong>
              <span>Flights</span>
            </div>
            <div>
              <strong>{Math.max(4 - completed, 0)}</strong>
              <span>Remaining</span>
            </div>
            <div>
              <strong>R${balance}</strong>
              <span>Total pay</span>
            </div>
          </div>
        </section>
        <section className="panel upcoming-card">
          <div className="section-title">
            <div>
              <p>UPCOMING FLIGHTS</p>
              <h3>Scheduled duties</h3>
            </div>
            <strong>{upcoming.length}</strong>
          </div>
          {upcoming.length ? (
            <div className="mini-flight">
              <PlaneTakeoff />
              <div>
                <strong>{upcoming[0].code}</strong>
                <span>
                  {upcoming[0].date} · {upcoming[0].time}
                </span>
              </div>
            </div>
          ) : (
            <div className="mini-empty">No upcoming flights scheduled.</div>
          )}
          <button onClick={() => go("Allocations")}>
            View all flights <ChevronRight />
          </button>
        </section>
      </aside>
    </div>
  );
}
function Quick({ n, label, action, onClick }) {
  return (
    <button className="quick" onClick={onClick}>
      <div>
        <strong>{n}</strong>
        <span>{label}</span>
      </div>
      <div>
        {action}
        <ChevronRight />
      </div>
    </button>
  );
}
const pageInfo = {
  Allocations: [
    "Flight allocations",
    "Browse open sectors and manage your upcoming duties.",
  ],
  Absence: ["Time away", "Submit and track leave or absence requests."],
  Records: [
    "Disciplinary record",
    "Review disciplinary actions issued to your account.",
  ],
  Documentation: [
    "Knowledge library",
    "Procedures, guides and crew reference material.",
  ],
  Vacancies: [
    "Internal opportunities",
    "Take the next step in your Emirates crew career.",
  ],
  Operations: [
    "Flight operations",
    "Schedule and manage flights across the network.",
  ],
  Disciplinary: [
    "Disciplinary management",
    "Issue and manage crew disciplinary actions.",
  ],
  "Portal Management": [
    "Portal management",
    "Configure roles, access and portal permissions.",
  ],
};
function Page(p) {
  const [title, sub] = pageInfo[p.name];
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p>CREW PORTAL</p>
          <h2>{title}</h2>
          <span>{sub}</span>
        </div>
      </div>
      {p.name === "Allocations" && (
        <Allocations
          flights={p.flights}
          setFlights={p.setFlights}
          notify={p.notify}
          userId={p.userId}
          rpName={p.rpName}
        />
      )}{" "}
      {p.name === "Absence" && (
        <Absence
          active={p.absence}
          setActive={p.setAbsence}
          notify={p.notify}
          userId={p.userId}
        />
      )}{" "}
      {p.name === "Records" && <Records items={p.discipline} />}{" "}
      {p.name === "Documentation" && <Documents notify={p.notify} />}{" "}
      {p.name === "Vacancies" && (
        <Empty
          icon={Binoculars}
          title="No internal vacancies"
          text="New crew opportunities will appear here when applications open."
        />
      )}{" "}
      {p.name === "Operations" && (
        <Operations
          flights={p.flights}
          setFlights={p.setFlights}
          balance={p.balance}
          setBalance={p.setBalance}
          notify={p.notify}
          userId={p.userId}
        />
      )}{" "}
      {p.name === "Disciplinary" && (
        <Disciplinary
          items={p.discipline}
          setItems={p.setDiscipline}
          notify={p.notify}
          userId={p.userId}
          crewMembers={p.crewMembers}
        />
      )}{" "}
      {p.name === "Portal Management" && (
        <PortalManagement
          roles={p.roles}
          setRoles={p.setRoles}
          notify={p.notify}
        />
      )}
    </div>
  );
}
function Allocations({ flights, setFlights, notify, userId, rpName }) {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(null);
  const shown = flights.filter((f) =>
    (f.code + " " + f.origin + " " + f.destination)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const take = async (flight, role, slot) => {
    const current = Object.entries(flight.assignments || {}).find(
      ([, name]) => name === rpName,
    );
    const key = `${role}:${slot}`;
    if (current && current[0] !== key)
      return notify(
        `Leave ${current[0].split(":")[0]} before choosing another role`,
      );
    const assignments = { ...(flight.assignments || {}) };
    if (assignments[key] === rpName) {
      const { error } = await supabase
        .from("flight_allocations")
        .delete()
        .eq("flight_id", flight.id)
        .eq("user_id", userId);
      if (error) return notify(error.message);
      delete assignments[key];
      notify(`Left ${role}`);
    } else {
      const dutyGroup = dutyGroups.find((group) =>
        group.roles.some(([name]) => name === role),
      )?.title;
      const { error } = await supabase.from("flight_allocations").insert({
        flight_id: flight.id,
        user_id: userId,
        duty_group: dutyGroup,
        duty_role: role,
        slot_number: slot + 1,
      });
      if (error) return notify(error.message);
      assignments[key] = rpName;
      notify(`Joined ${role}`);
    }
    setFlights(
      flights.map((f) => (f.id === flight.id ? { ...f, assignments } : f)),
    );
  };
  return (
    <>
      <div className="filters">
        <label>
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search flight number or destination"
          />
        </label>
        <button onClick={() => setQuery("")}>Clear filters</button>
      </div>
      {shown.length ? (
        <div className="allocation-list">
          {shown.map((f) => (
            <section className="panel allocation" key={f.id}>
              <button
                className="allocation-head"
                onClick={() => setOpen(open === f.id ? null : f.id)}
              >
                <div className="route-icon">
                  <Plane />
                </div>
                <div>
                  <strong>{f.code}</strong>
                  <span>
                    {f.origin} → {f.destination}
                  </span>
                </div>
                <div>
                  <span>Date</span>
                  <strong>{f.date}</strong>
                </div>
                <div>
                  <span>Departure</span>
                  <strong>{f.time}</strong>
                </div>
                <div>
                  <span>Aircraft</span>
                  <strong>{f.aircraft}</strong>
                </div>
                <Chip>
                  {Object.keys(f.assignments || {}).length}/25 STAFFED
                </Chip>
                <ChevronRight className={open === f.id ? "rotated" : ""} />
              </button>
              {open === f.id && (
                <div className="duty-board">
                  {dutyGroups.map((group) => (
                    <div className="duty-group" key={group.title}>
                      <h3>{group.title}</h3>
                      {group.roles.map(([role, count]) => {
                        const filled = Array.from(
                          { length: count },
                          (_, i) => (f.assignments || {})[`${role}:${i}`],
                        ).filter(Boolean).length;
                        return (
                          <div className="duty-role" key={role}>
                            <div className="duty-role-title">
                              <strong>
                                {role} ({filled}/{count})
                              </strong>
                            </div>
                            <div className="slots">
                              {Array.from({ length: count }, (_, i) => {
                                const occupant = (f.assignments || {})[
                                  `${role}:${i}`
                                ];
                                return (
                                  <button
                                    key={i}
                                    className={occupant ? "occupied" : ""}
                                    onClick={() => take(f, role, i)}
                                    disabled={
                                      !!occupant && occupant !== rpName
                                    }
                                  >
                                    {occupant || "Open position"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty
          icon={Plane}
          title="No flight allocations"
          text="Flights assigned or opened by Operations will appear here."
        />
      )}
    </>
  );
}
function Absence({ active, setActive, notify, userId }) {
  const [form, setForm] = useState({ starts_on: "", ends_on: "", reason: "" });
  const submit = async (event) => {
    event.preventDefault();
    if (!form.starts_on || !form.ends_on || !form.reason.trim())
      return notify("Complete the LOA dates and reason");
    const { error } = await supabase
      .from("loa_requests")
      .insert({ ...form, reason: form.reason.trim(), user_id: userId });
    if (error) return notify(error.message);
    setActive(true);
    notify("LOA submitted and queued for the Emirates bot");
  };
  const withdraw = async () => {
    const { error } = await supabase
      .from("loa_requests")
      .update({ status: "withdrawn" })
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) return notify(error.message);
    setActive(false);
    notify("LOA request withdrawn");
  };
  return (
    <div className="split">
      <form className="panel admin-form" onSubmit={submit}>
        <div className="empty-icon">
          <Palmtree />
        </div>
        <h3>{active ? "Absence request pending" : "No active requests"}</h3>
        <p>
          {active
            ? "Your request is awaiting review."
            : "Your absence and leave requests will appear here."}
        </p>
        {!active && (
          <>
            <div className="form-row">
              <Field
                label="Start date"
                type="date"
                value={form.starts_on}
                onChange={(e) =>
                  setForm({ ...form, starts_on: e.target.value })
                }
              />
              <Field
                label="End date"
                type="date"
                value={form.ends_on}
                onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
              />
            </div>
            <label className="field">
              <span>Reason</span>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Tell management why you need leave"
              />
            </label>
          </>
        )}
        <button
          className="primary"
          type={active ? "button" : "submit"}
          onClick={active ? withdraw : undefined}
        >
          {active ? (
            <>
              <X /> Withdraw request
            </>
          ) : (
            <>
              <Plus /> Request absence
            </>
          )}
        </button>
      </form>
      <section className="panel allowance">
        <p className="eyebrow">LEAVE ALLOWANCE</p>
        <h3>Not yet available</h3>
        <p>
          Your allowance will show here once it is synced to your crew account.
        </p>
      </section>
    </div>
  );
}
function Records({ items }) {
  return (
    <>
      <section className="disciplinary-head panel">
        <div>
          <p className="eyebrow">YOUR RECORD</p>
          <h3>Disciplinary history</h3>
          <span>
            Only disciplinary actions issued to your crew account are shown
            here.
          </span>
        </div>
        <Chip tone={items.length ? "" : "green"}>
          {items.length ? `${items.length} ACTIVE` : "CLEAR RECORD"}
        </Chip>
      </section>
      {items.length ? (
        <div className="cases">
          {items.map((x) => (
            <CaseCard key={x.id} item={x} />
          ))}
        </div>
      ) : (
        <Empty
          icon={ShieldCheck}
          title="No disciplinary actions"
          text="You currently have no warnings, suspensions or other disciplinary actions on your record."
          extra="record-empty"
        />
      )}
    </>
  );
}
function Documents({ notify }) {
  return (
    <>
      <div className="filters">
        <label>
          <Search />
          <input placeholder="Search guides, policies and documents" />
        </label>
        <button onClick={() => notify("Document filters updated")}>
          <SlidersHorizontal /> Filter
        </button>
      </div>
      <div className="cards">
        {["Crew handbook", "Safety procedures", "Service standards"].map(
          (d) => (
            <button
              key={d}
              className="resource panel"
              onClick={() => notify(`${d} opened`)}
            >
              <div className="doc-icon">
                <FileText />
              </div>
              <Chip>CREW DOCUMENT</Chip>
              <h3>{d}</h3>
              <p>Available to your crew role</p>
              <span>
                Open document <ArrowUpRight />
              </span>
            </button>
          ),
        )}
      </div>
    </>
  );
}
function Operations({ flights, setFlights, balance, setBalance, notify, userId }) {
  const [form, setForm] = useState({
    code: "",
    origin: "Dubai",
    destination: "",
    date: "",
    time: "",
    aircraft: "A350-900",
  });
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.code || !form.destination || !form.date || !form.time)
      return notify("Complete all required flight details");
    const departureAt = new Date(`${form.date}T${form.time}`).toISOString();
    const { data, error } = await supabase
      .from("flights")
      .insert({
        code: form.code.trim(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        departure_at: departureAt,
        aircraft: form.aircraft,
        created_by: userId,
      })
      .select("id,code,origin,destination,departure_at,aircraft")
      .single();
    if (error) return notify(error.message);
    setFlights([...flights, {
      id: data.id,
      code: data.code,
      origin: data.origin,
      destination: data.destination,
      date: new Date(data.departure_at).toLocaleDateString("en-GB"),
      time: new Date(data.departure_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      aircraft: data.aircraft,
      assignments: {},
    }]);
    setForm({ ...form, code: "", destination: "", date: "", time: "" });
    notify("Flight scheduled successfully");
  };
  const end = async (f) => {
    const attended = Object.values(f.assignments || {}).includes("Jakele7");
    const { error } = await supabase.from("flights").delete().eq("id", f.id);
    if (error) return notify(error.message);
    setFlights(flights.filter((x) => x.id !== f.id));
    if (attended) setBalance(balance + 20);
    notify(
      attended
        ? "Flight ended — R$20 paid to Jakele7"
        : "Flight ended — no attendance payout",
    );
  };
  return (
    <div className="admin-grid">
      <form className="panel admin-form" onSubmit={submit}>
        <div className="section-title">
          <div>
            <p>NEW OPERATION</p>
            <h3>Schedule a flight</h3>
          </div>
          <PlaneTakeoff />
        </div>
        <Field
          label="Flight number"
          name="code"
          value={form.code}
          onChange={change}
          placeholder="EK 264"
        />
        <div className="form-row">
          <Field
            label="Origin"
            name="origin"
            value={form.origin}
            onChange={change}
          />
          <Field
            label="Destination"
            name="destination"
            value={form.destination}
            onChange={change}
            placeholder="London Heathrow"
          />
        </div>
        <div className="form-row">
          <Field
            label="Date"
            name="date"
            type="date"
            value={form.date}
            onChange={change}
          />
          <Field
            label="Departure"
            name="time"
            type="time"
            value={form.time}
            onChange={change}
          />
        </div>
        <label className="field">
          <span>Aircraft</span>
          <select name="aircraft" value={form.aircraft} onChange={change}>
            <option>A350-900</option>
            <option>A380-800</option>
            <option>B777-300ER</option>
          </select>
        </label>
        <button className="primary" type="submit">
          <Plus /> Schedule flight
        </button>
      </form>
      <AdminList
        title="Scheduled flights"
        count={flights.length}
        empty="No flights have been scheduled."
      >
        {flights.map((f) => (
          <div className="manage-row" key={f.id}>
            <div>
              <strong>{f.code}</strong>
              <span>
                {f.origin} → {f.destination} ·{" "}
                {Object.keys(f.assignments || {}).length} attending
              </span>
            </div>
            <button className="end-flight" onClick={() => end(f)}>
              <PlaneTakeoff /> End flight
            </button>
          </div>
        ))}
      </AdminList>
    </div>
  );
}
function Disciplinary({ items, setItems, notify, userId, crewMembers }) {
  const [type, setType] = useState("Warning"),
    [reason, setReason] = useState(""),
    [selectedUserId, setSelectedUserId] = useState(userId);
  const issue = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify("Add a reason before issuing");
    if (!selectedUserId) return notify("Choose a crew member");
    const selectedMember = crewMembers.find(
      (member) => member.id === selectedUserId,
    );
    const record = {
      id: Date.now(),
      type,
      reason,
      date: new Date().toLocaleDateString("en-GB"),
      issuer: "Emirates Management",
    };
    try {
      const { data, error } = await supabase
        .from("disciplinary_actions")
        .insert({
          user_id: selectedUserId,
          issued_by: userId,
          action_type: type.toLowerCase(),
          reason: reason.trim(),
        })
        .select("id,created_at")
        .single();
      if (error) throw error;
      setItems([
        ...items,
        {
          ...record,
          id: data.id,
          date: new Date(data.created_at).toLocaleDateString("en-GB"),
        },
      ]);
      setReason("");
      notify(
        `${type} issued to ${selectedMember?.rp_name || "crew member"} and queued for Discord`,
      );
    } catch (error) {
      notify(error.message || "Could not reach the Emirates bot");
    }
  };
  return (
    <div className="admin-grid">
      <form className="panel admin-form" onSubmit={issue}>
        <div className="section-title">
          <div>
            <p>NEW ACTION</p>
            <h3>Issue disciplinary</h3>
          </div>
          <ShieldAlert />
        </div>
        <label className="field">
          <span>Crew member</span>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            {crewMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.rp_name} — {member.rank_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Action</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>Warning</option>
            <option>Infraction</option>
            <option>Termination</option>
            <option>Suspension</option>
          </select>
        </label>
        <label className="field">
          <span>Reason</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the reason and relevant details"
          />
        </label>
        <button className="primary" type="submit">
          <ShieldAlert /> Issue action
        </button>
      </form>
      <AdminList
        title="Disciplinary actions"
        count={items.length}
        empty="No disciplinary actions issued."
      >
        {items.map((x) => (
          <ManageRow
            key={x.id}
            title={x.type}
            sub={`${x.reason} · ${x.date}`}
            onDelete={() => {
              void (async () => {
                const { error } = await supabase
                  .from("disciplinary_actions")
                  .delete()
                  .eq("id", x.id);
                if (error) return notify(error.message);
                setItems(items.filter((i) => i.id !== x.id));
                notify("Disciplinary action removed and user notified");
              })();
            }}
          />
        ))}
      </AdminList>
    </div>
  );
}
function PortalManagement({ roles, setRoles, notify }) {
  const perms = ["Schedule flights", "Manage discipline", "Manage portal"];
  const toggle = (index, p) =>
    setRoles(
      roles.map((r, i) =>
        i === index
          ? {
              ...r,
              permissions: r.permissions.includes(p)
                ? r.permissions.filter((x) => x !== p)
                : [...r.permissions, p],
            }
          : r,
      ),
    );
  return (
    <div className="roles">
      <div className="manager-toolbar panel">
        <div>
          <Users />
          <div>
            <strong>Role permissions</strong>
            <span>Control what each portal role can access.</span>
          </div>
        </div>
        <button
          className="primary"
          onClick={() => notify("Role configuration saved")}
        >
          <Save /> Save changes
        </button>
      </div>
      {roles.map((role, index) => (
        <section className="panel role" key={role.name}>
          <div className="role-head">
            <div>
              <h3>{role.name}</h3>
              <span>
                {role.members} member{role.members === 1 ? "" : "s"}
              </span>
            </div>
            <Chip>{index === 0 ? "ADMIN" : "ROLE"}</Chip>
          </div>
          <div className="permission-grid">
            {perms.map((p) => (
              <label key={p}>
                <span>
                  <strong>{p}</strong>
                  <small>
                    {p === "Schedule flights"
                      ? "Create, edit and remove flight operations."
                      : p === "Manage discipline"
                        ? "Issue and remove disciplinary actions."
                        : "Change roles and portal permissions."}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={role.permissions.includes(p)}
                  onChange={() => toggle(index, p)}
                />
                <i />
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
function AdminList({ title, count, empty, children }) {
  return (
    <section className="panel admin-list">
      <div className="section-title">
        <div>
          <p>MANAGEMENT</p>
          <h3>{title}</h3>
        </div>
        <Chip>{count} ITEMS</Chip>
      </div>
      {count ? children : <div className="mini-empty large">{empty}</div>}
    </section>
  );
}
function ManageRow({ title, sub, onDelete }) {
  return (
    <div className="manage-row">
      <div>
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
      <button aria-label={`Delete ${title}`} onClick={onDelete}>
        <Trash2 />
      </button>
    </div>
  );
}
function CaseCard({ item }) {
  return (
    <section className="panel case">
      <ShieldAlert />
      <div>
        <Chip>{item.type}</Chip>
        <h3>{item.reason}</h3>
        <p>
          Issued {item.date} by {item.issuer}
        </p>
      </div>
    </section>
  );
}
function ProfileModal({
  rpName,
  setRpName,
  discordId,
  setDiscordId,
  roles,
  setRoles,
  close,
  notify,
  userId,
}) {
  const [draft, setDraft] = useState(rpName),
    [memberId, setMemberId] = useState(discordId),
    [loading, setLoading] = useState(false);
  const refresh = async () => {
    if (!memberId.trim()) return notify("Enter a Discord member ID first");
    setLoading(true);
    try {
      const response = await fetch(
        `/api/roles?discordId=${encodeURIComponent(memberId.trim())}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Role refresh failed");
      setRoles(data.roles || []);
      setDiscordId(memberId.trim());
      notify("Discord roles refreshed");
    } catch (error) {
      notify(error.message || "Could not reach the Emirates bot");
    } finally {
      setLoading(false);
    }
  };
  const save = async () => {
    if (!draft.trim()) return notify("RP name cannot be empty");
    const { error } = await supabase
      .from("crew_profiles")
      .update({ rp_name: draft.trim() })
      .eq("id", userId);
    if (error) return notify(error.message);
    setRpName(draft.trim());
    notify("Profile saved to Supabase");
    close();
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section className="profile-modal panel">
        <div className="modal-head">
          <div>
            <p className="eyebrow">CREW PROFILE</p>
            <h2>Profile settings</h2>
          </div>
          <button aria-label="Close profile" onClick={close}>
            <X />
          </button>
        </div>
        <div className="profile-identity">
          <div className="avatar large">
            {draft.slice(0, 2).toUpperCase() || "RP"}
          </div>
          <div>
            <strong>{draft || "Crew member"}</strong>
            <span>Chief Operations Officer</span>
          </div>
        </div>
        <Field
          label="RP name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter your roleplay name"
        />
        <Field
          label="Discord member ID"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          placeholder="e.g. 123456789012345678"
        />
        <div className="role-sync">
          <div>
            <strong>Discord roles</strong>
            <span>
              {roles.length ? roles.join(" · ") : "No roles synced yet"}
            </span>
          </div>
          <button onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "spinning" : ""} />
            {loading ? "Refreshing…" : "Refresh roles"}
          </button>
        </div>
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={save}>
            <Save /> Save profile
          </button>
        </div>
      </section>
    </div>
  );
}
function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function Empty({ icon: Icon, title, text, extra = "" }) {
  return (
    <section className={"panel empty " + extra}>
      <div className="empty-icon">
        <Icon />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);
