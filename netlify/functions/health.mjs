export default async () => {
  return Response.json({
    status: 'healthy',
    service: 'ReplyPilot',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  })
}

export const config = {
  path: '/api/health',
}
