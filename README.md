# BFA Dryer HMI — Web Frontend

Industrial HMI (Human-Machine Interface) for banana dryer control.

- **Frontend**: React 18 + TypeScript + Vite + Tailwind
- **Backend**: FastAPI + Modbus TCP client + WebSocket
- **Deployment**: Docker Compose (single command on HMI PC)

## Architecture

```
┌──────────────────────────────────────────┐
│         HMI PC (Industrial)              │
│  ┌────────────────────────────────────┐  │
│  │     Docker Compose                  │  │
│  │  ┌──────────┐    ┌──────────────┐  │  │
│  │  │ React    │    │ FastAPI      │  │  │
│  │  │ Frontend │◄──►│ Backend      │  │  │
│  │  │ :3000    │    │ :8000        │  │  │
│  │  └──────────┘    └──────┬───────┘  │  │
│  │                         │ Modbus   │  │
│  └─────────────────────────┼──────────┘  │
│                            │             │
└────────────────────────────┼─────────────┘
                             │
                    ┌────────▼────────┐
                    │  PLC (Modbus)   │
                    │   10.x.x.x:502  │
                    └─────────────────┘
```

## Setup

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for frontend development, not needed for production)
- Python 3.11+ (for backend development, not needed for production)

### 1. Configure PLC Connection

```bash
cp .env.example .env
nano .env  # Edit PLC_HOST to your PLC IP
```

### 2. Initialize Frontend

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install

# Install dependencies
npm install -D tailwindcss postcss autoprefixer
npm install axios zustand
npx tailwindcss init -p
```

### 3. Build & Deploy

```bash
# Build both services
docker-compose build

# Run
docker-compose up -d

# HMI will be available at: http://localhost:3000
# Backend API: http://localhost:8000
```

## Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev server: http://localhost:5173

## Modbus Mapping

Update in `backend/app/modbus_client.py`:

| Function | Address | Description |
|----------|---------|-------------|
| Coil | 0 | Burner ON/OFF |
| Coil | 1 | Fan ON/OFF |
| Coil | 2 | Conveyor A1 ON/OFF |
| Holding Reg | 0 | Heat Input (°C × 10) |
| Holding Reg | 1 | Product 1 (°C × 10) |
| Holding Reg | 2 | Product 2 (°C × 10) |

*Map according to your PLC's register layout.*

## Deployment on HMI PC

1. Copy project to HMI PC
2. `docker-compose build`
3. `docker-compose up -d`
4. Access: http://localhost (or IP:3000)

## Troubleshooting

**PLC Connection Fails**
- Check `.env` PLC_HOST IP address
- Verify network connectivity: `ping <PLC_IP>`
- Check PLC Modbus TCP port (default 502)

**WebSocket Errors**
- Backend may not be running. Check: `docker logs bfa-hmi-backend`
- Frontend unable to reach backend on different IP? Update API URL in frontend code

**Build Fails**
- `docker-compose build --no-cache`
- Check Node/Python versions in Dockerfiles

---

**Backend API Docs**: http://localhost:8000/docs (FastAPI Swagger)
