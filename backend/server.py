from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 1 week

security = HTTPBearer()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class UserRole:
    SUPER_ADMIN = "super_admin"
    COACH = "coach"
    ATHLETE = "athlete"

class Society(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    id: str
    name: str
    created_at: str

class User(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    id: str
    email: EmailStr
    name: str
    role: str
    society_id: Optional[str] = None
    category: Optional[str] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    created_at: str

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str
    society_id: Optional[str] = None
    category: Optional[str] = None
    weight: Optional[float] = None
    height: Optional[float] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Test(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    id: str
    athlete_id: str
    athlete_name: str
    society_id: str
    date: str
    distance: float
    time_seconds: float
    split_500: Optional[float] = None
    watts: Optional[float] = None
    watts_per_kg: Optional[float] = None
    strokes: Optional[int] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    notes: Optional[str] = None
    created_at: str

class TestCreate(BaseModel):
    athlete_id: str
    date: str
    distance: float
    time_seconds: float
    strokes: Optional[int] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    notes: Optional[str] = None

class SocietyCreate(BaseModel):
    name: str

# ==================== UTILS ====================

def create_jwt_token(user_id: str, email: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    return verify_jwt_token(token)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def calculate_split_500(distance: float, time_seconds: float) -> float:
    """Calculate split time per 500 meters"""
    if distance <= 0:
        return 0
    return (time_seconds / distance) * 500

def calculate_watts(split_500: float) -> float:
    """Calculate watts from split/500m using standard erg formula"""
    if split_500 <= 0:
        return 0
    pace = split_500
    watts = 2.8 / (pace / 500) ** 3
    return round(watts, 2)

def calculate_watts_per_kg(watts: float, weight: float) -> float:
    """Calculate watts per kg"""
    if weight <= 0:
        return 0
    return round(watts / weight, 2)

import uuid

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate role
    if user_data.role not in [UserRole.SUPER_ADMIN, UserRole.COACH, UserRole.ATHLETE]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Hash password
    hashed_pw = hash_password(user_data.password)
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hashed_pw,
        "name": user_data.name,
        "role": user_data.role,
        "society_id": user_data.society_id,
        "category": user_data.category,
        "weight": user_data.weight,
        "height": user_data.height,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    # Generate token
    token = create_jwt_token(user_id, user_data.email, user_data.role)
    
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "role": user_data.role,
            "society_id": user_data.society_id
        }
    }

@api_router.post("/auth/login")
async def login(login_data: UserLogin):
    # Find user
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify password
    if not verify_password(login_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Generate token
    token = create_jwt_token(user["id"], user["email"], user["role"])
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "society_id": user.get("society_id"),
            "category": user.get("category"),
            "weight": user.get("weight"),
            "height": user.get("height")
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ==================== SOCIETY ROUTES ====================

@api_router.post("/societies", response_model=Society)
async def create_society(society_data: SocietyCreate, current_user: dict = Depends(get_current_user)):
    society_id = str(uuid.uuid4())
    society_doc = {
        "id": society_id,
        "name": society_data.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.societies.insert_one(society_doc)
    return Society(**society_doc)

@api_router.get("/societies", response_model=List[Society])
async def get_societies(current_user: dict = Depends(get_current_user)):
    societies = await db.societies.find({}, {"_id": 0}).to_list(1000)
    return societies

# ==================== USER ROUTES ====================

@api_router.get("/users", response_model=List[User])
async def get_users(current_user: dict = Depends(get_current_user)):
    # Coaches can only see athletes in their society
    if current_user["role"] == UserRole.COACH:
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not user or not user.get("society_id"):
            return []
        users = await db.users.find(
            {"society_id": user["society_id"]},
            {"_id": 0, "password": 0}
        ).to_list(1000)
    else:
        users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ==================== TEST ROUTES ====================

@api_router.post("/tests", response_model=Test)
async def create_test(test_data: TestCreate, current_user: dict = Depends(get_current_user)):
    # Get athlete info
    athlete = await db.users.find_one({"id": test_data.athlete_id}, {"_id": 0})
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Check permissions
    if current_user["role"] == UserRole.ATHLETE:
        if current_user["user_id"] != test_data.athlete_id:
            raise HTTPException(status_code=403, detail="Athletes can only add their own tests")
    elif current_user["role"] == UserRole.COACH:
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if user.get("society_id") != athlete.get("society_id"):
            raise HTTPException(status_code=403, detail="Coaches can only add tests for their society")
    
    # Calculate metrics
    split_500 = calculate_split_500(test_data.distance, test_data.time_seconds)
    watts = calculate_watts(split_500)
    
    weight = test_data.weight or athlete.get("weight", 0)
    watts_per_kg = calculate_watts_per_kg(watts, weight) if weight else None
    
    test_id = str(uuid.uuid4())
    test_doc = {
        "id": test_id,
        "athlete_id": test_data.athlete_id,
        "athlete_name": athlete["name"],
        "society_id": athlete.get("society_id"),
        "date": test_data.date,
        "distance": test_data.distance,
        "time_seconds": test_data.time_seconds,
        "split_500": split_500,
        "watts": watts,
        "watts_per_kg": watts_per_kg,
        "strokes": test_data.strokes,
        "weight": weight,
        "height": test_data.height or athlete.get("height"),
        "notes": test_data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tests.insert_one(test_doc)
    return Test(**test_doc)

@api_router.get("/tests", response_model=List[Test])
async def get_tests(athlete_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    
    # Athletes can only see their own tests
    if current_user["role"] == UserRole.ATHLETE:
        query["athlete_id"] = current_user["user_id"]
    elif current_user["role"] == UserRole.COACH:
        # Coaches see tests from their society
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if user and user.get("society_id"):
            query["society_id"] = user["society_id"]
    
    # Apply athlete filter if provided
    if athlete_id:
        query["athlete_id"] = athlete_id
    
    tests = await db.tests.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    return tests

@api_router.get("/tests/athlete/{athlete_id}/stats")
async def get_athlete_stats(athlete_id: str, current_user: dict = Depends(get_current_user)):
    # Get all tests for athlete
    tests = await db.tests.find({"athlete_id": athlete_id}, {"_id": 0}).to_list(10000)
    
    if not tests:
        return {"athlete_id": athlete_id, "tests_count": 0, "stats": {}}
    
    # Group by distance
    tests_by_distance = {}
    for test in tests:
        dist = test["distance"]
        if dist not in tests_by_distance:
            tests_by_distance[dist] = []
        tests_by_distance[dist].append(test)
    
    # Calculate stats for common distances
    stats = {}
    for distance, distance_tests in tests_by_distance.items():
        sorted_tests = sorted(distance_tests, key=lambda x: x["time_seconds"])
        best_test = sorted_tests[0]
        latest_test = sorted(distance_tests, key=lambda x: x["date"], reverse=True)[0]
        
        stats[f"{int(distance)}m"] = {
            "best": {
                "time_seconds": best_test["time_seconds"],
                "split_500": best_test["split_500"],
                "watts": best_test["watts"],
                "date": best_test["date"]
            },
            "latest": {
                "time_seconds": latest_test["time_seconds"],
                "split_500": latest_test["split_500"],
                "watts": latest_test["watts"],
                "date": latest_test["date"]
            },
            "count": len(distance_tests)
        }
    
    return {
        "athlete_id": athlete_id,
        "tests_count": len(tests),
        "stats": stats,
        "all_tests": tests
    }

# ==================== INCLUDE ROUTER ====================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()