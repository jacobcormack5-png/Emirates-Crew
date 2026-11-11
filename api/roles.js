export default async function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({error:'Method not allowed'});
  if(!process.env.EMIRATES_BOT_URL||!process.env.PORTAL_API_SECRET)return response.status(503).json({error:'Bot integration is not configured'});
  const discordId=String(request.query.discordId||'');
  const upstream=await fetch(`${process.env.EMIRATES_BOT_URL.replace(/\/$/,'')}/api/roles?discordId=${encodeURIComponent(discordId)}`,{headers:{authorization:`Bearer ${process.env.PORTAL_API_SECRET}`}}).catch(()=>null);
  if(!upstream)return response.status(502).json({error:'Emirates bot is unavailable'});
  const data=await upstream.json().catch(()=>({error:'Invalid bot response'}));
  return response.status(upstream.status).json(data);
}
