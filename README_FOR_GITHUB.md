# ReplyPilot Backend

Google Review Response Service for Local Businesses

## Setup
1. Deploy to Railway/Render
2. Set Google API environment variables
3. Start server: `npm start`

## Environment Variables
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_API_KEY=your-api-key
JWT_SECRET=your-jwt-secret
```

## API Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/google/auth/url` - Google OAuth URL
- `GET /api/google/business/reviews` - Fetch business reviews
- `POST /api/google/business/reviews/{id}/reply` - Reply to review

## Deployment
- Railway: Auto-deploy from this repo
- Render: Connect GitHub repo