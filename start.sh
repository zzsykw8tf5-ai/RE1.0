#!/bin/bash
# RE Analyst Pro – Development Startup Script

echo "Starting RE Analyst Pro..."
echo ""

# Start Backend
echo "Starting Backend (FastAPI on port 8000)..."
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
sleep 3

# Start Frontend
echo "Starting Frontend (Vite on port 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "RE Analyst Pro is running!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop."

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT
wait
