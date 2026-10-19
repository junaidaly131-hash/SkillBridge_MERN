# SkillBridge - Skill Exchange Platform

A MERN stack application connecting students and teachers for skill exchange with AI-powered recommendations, real-time chat, and integrated meeting scheduling.

## 🚀 Quick Links

- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Deploy to Vercel & Render
- **[Frontend Implementation](FRONTEND_IMPLEMENTATION.md)** - React app details
- **[Backend Implementation](BACKEND_IMPLEMENTATION.md)** - Node.js API details  
- **[AI Recommendation Service](AI_RECOMMENDATION_SERVICE.md)** - Python ML service

## 📋 Features

- 🔐 **Authentication** - JWT + 2FA + Google OAuth
- 💬 **Real-time Chat** - Socket.IO messaging
- 🤖 **AI Recommendations** - Content-based teacher matching
- 📅 **Meeting Scheduler** - Book sessions with teachers
- 💳 **Credit System** - Virtual currency for services
- 📊 **User Profiles** - Skills, ratings, and portfolios
- 📧 **Email Notifications** - Verification codes & invites
- ☁️ **Cloud Storage** - Cloudinary for images

## 🛠️ Tech Stack

### Frontend
- React 19 + Vite
- Redux Toolkit
- Tailwind CSS
- Socket.IO Client

### Backend  
- Node.js + Express
- MongoDB + Mongoose
- Socket.IO
- JWT Authentication

### AI Service
- Python 3.11
- FastAPI
- scikit-learn
- MongoDB (model storage)

## 📦 Installation

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB (local or Atlas)

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

### Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with API URL
npm run dev
```

### AI Service Setup
```bash
cd recommendation-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with MongoDB URI
uvicorn main:app --reload --port 8001
```

## 🌐 Production Deployment

- **Frontend:** Vercel (custom domain) - https://www.skill-bridge.me
- **Backend:** Render - https://skillbridge-mern.onrender.com
- **AI Service:** Render - https://skillbridge-recommendation-service.onrender.com
- **Database:** MongoDB Atlas (cloud)

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

## 📁 Project Structure

```
SkillBridge_MERN/
├── frontend/              # React application
├── backend/               # Express API server
├── recommendation-service/# Python AI service
├── DEPLOYMENT_GUIDE.md    # Production deployment
├── FRONTEND_IMPLEMENTATION.md
├── BACKEND_IMPLEMENTATION.md
└── AI_RECOMMENDATION_SERVICE.md
```

## 🔑 Key Environment Variables

### Backend (.env)
```env
MONGODB_URI=mongodb://localhost:27017/skillbridge
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:5173
RECOMMENDATION_SERVICE_URL=http://localhost:8001
CLOUDINARY_CLOUD_NAME=your-cloud-name
SMTP_HOST=smtp.gmail.com
```

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

### AI Service (.env)
```env
MONGODB_URI=mongodb://localhost:27017/skillbridge
API_KEY=your-api-key
ALLOWED_ORIGINS=http://localhost:5173
```

## 🧪 Testing

AI Tutor Phase 2 private-document RAG architecture, privacy lifecycle, configuration, and beta rollout steps are documented in [docs/ai-tutor-document-rag.md](docs/ai-tutor-document-rag.md).

AI Tutor Phase 3A document summaries, practice quizzes, grading/privacy boundaries, configuration, and limited-beta rollout steps are documented in [docs/ai-tutor-study-tools.md](docs/ai-tutor-study-tools.md).

```bash
# Backend (if tests exist)
cd backend
npm test

# Frontend (if tests exist)
cd frontend
npm test

# AI Service (if tests exist)
cd recommendation-service
pytest
```

## 📖 API Documentation

Once running, visit:
- Backend: http://localhost:5000/api (endpoints in BACKEND_IMPLEMENTATION.md)
- AI Service: http://localhost:8001/docs (Swagger UI)

## 🐛 Common Issues

### MongoDB Connection Failed
- Ensure MongoDB is running locally or Atlas IP whitelist configured
- Check MONGODB_URI format

### CORS Errors
- Verify FRONTEND_URL in backend matches frontend origin
- No trailing slashes in URLs

### Socket.IO Not Connecting
- Check VITE_SOCKET_URL matches backend
- Ensure JWT token is sent in socket auth

### AI Recommendations Not Working
- Train models first: `POST /api/recommendations/train` (admin)
- Check RECOMMENDATION_SERVICE_URL and API_KEY match

## 👥 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👤 Author

**Junaid Ali**
- GitHub: [@JunaidAly](https://github.com/JunaidAly)

## 🙏 Acknowledgments

- MongoDB Atlas for database hosting
- Render for backend hosting
- Vercel for frontend hosting
- Cloudinary for image storage
