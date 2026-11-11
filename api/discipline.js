export default async function handler(request,response){
  if(request.method!=='POST')return response.status(405).json({error:'Method not allowed'});
  if(!process.env.EMIRATES_BOT_URL||!process.env.PORTAL_API_SECRET)return response.status(503).json({error:'Bot integration is not configured'});
  const upstream=await fetch(`${process.env.EMIRATES_BOT_URL.replace(/\/$/,'')}/api/discipline`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.PORTAL_API_SECRET}`},body:JSON.stringify(request.body)}).catch(()=>null);
  if(!upstream)return response.status(502).json({error:'Emirates bot is unavailable'});
  const data=await upstream.json().catch(()=>({error:'Invalid bot response'}));
  return response.status(upstream.status).json(data);
}
