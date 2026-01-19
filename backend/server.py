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
import uuid
import asyncio
import resend

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

# Resend Settings
resend.api_key = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

# Rate limiting for password reset
password_reset_attempts = {}  # email: [timestamp, timestamp, ...]

security = HTTPBearer()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class UserRole:
    SUPER_ADMIN = "super_admin"
    COACH = "coach"
    ATHLETE = "athlete"

class UserStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

def calculate_category_from_birth_year(birth_year: int) -> str:
    """Calculate rowing category based on birth year according to FIC rules
    Categories are based on age reached during the calendar year (by Dec 31)"""
    from datetime import datetime
    current_year = datetime.now().year
    age_in_year = current_year - birth_year
    
    if age_in_year == 10:
        return "ALLIEVI A"
    elif age_in_year == 11:
        return "ALLIEVI B1"
    elif age_in_year == 12:
        return "ALLIEVI B2"
    elif age_in_year == 13:
        return "ALLIEVI C"
    elif age_in_year == 14:
        return "CADETTI"
    elif age_in_year == 15 or age_in_year == 16:
        return "RAGAZZI"
    elif age_in_year == 17 or age_in_year == 18:
        return "JUNIOR"
    elif age_in_year >= 19 and age_in_year <= 22:
        return "UNDER 23"
    elif age_in_year >= 23 and age_in_year <= 26:
        return "SENIOR"
    elif age_in_year >= 27:
        return "MASTER"
    else:
        return "NON CLASSIFICATO"

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
    status: str
    society_ids: Optional[List[str]] = None
    birth_year: Optional[int] = None
    category: Optional[str] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    designated_coach_id: Optional[str] = None  # Coach che può vedere i test di questo coach/super_admin
    created_at: str

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str
    society_id: Optional[str] = None
    birth_year: Optional[int] = None
    weight: Optional[float] = None
    height: Optional[float] = None

class SocietyChangeRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    id: str
    athlete_id: str
    athlete_name: str
    old_society_id: Optional[str]
    new_society_id: str
    new_society_name: str
    status: str
    created_at: str

class ApprovalRequest(BaseModel):
    user_id: str
    action: str  # "approve" or "reject"

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

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
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    # Validate role
    if user_data.role not in [UserRole.SUPER_ADMIN, UserRole.COACH, UserRole.ATHLETE]:
        raise HTTPException(status_code=400, detail="Ruolo non valido")
    
    # Calculate category from birth year
    category = None
    if user_data.birth_year:
        category = calculate_category_from_birth_year(user_data.birth_year)
    
    # Hash password
    hashed_pw = hash_password(user_data.password)
    
    # Determine initial status
    # Super admins must be approved by existing super admin (except first one)
    # Coaches and athletes start as pending
    user_status = UserStatus.PENDING
    
    # Check if this is the first user (should be super admin)
    user_count = await db.users.count_documents({})
    if user_count == 0 and user_data.email == "acquistapacem09@gmail.com":
        user_status = UserStatus.APPROVED
    
    # Create user
    user_id = str(uuid.uuid4())
    society_ids = [user_data.society_id] if user_data.society_id else []
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hashed_pw,
        "name": user_data.name,
        "role": user_data.role,
        "status": user_status,
        "society_ids": society_ids,
        "birth_year": user_data.birth_year,
        "category": category,
        "weight": user_data.weight,
        "height": user_data.height,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    # If approved, generate token
    if user_status == UserStatus.APPROVED:
        token = create_jwt_token(user_id, user_data.email, user_data.role)
        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": user_data.email,
                "name": user_data.name,
                "role": user_data.role,
                "status": user_status,
                "society_ids": society_ids
            }
        }
    else:
        return {
            "message": "Registrazione effettuata. In attesa di approvazione.",
            "user": {
                "id": user_id,
                "email": user_data.email,
                "name": user_data.name,
                "role": user_data.role,
                "status": status
            }
        }

@api_router.post("/auth/login")
async def login(login_data: UserLogin):
    # Find user
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    # Verify password
    if not verify_password(login_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    # Check if user is approved
    if user.get("status") != UserStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Account in attesa di approvazione")
    
    # Generate token
    token = create_jwt_token(user["id"], user["email"], user["role"])
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "status": user.get("status"),
            "society_ids": user.get("society_ids", []),
            "category": user.get("category"),
            "birth_year": user.get("birth_year"),
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

@api_router.post("/auth/forgot-password")
async def forgot_password(request: PasswordResetRequest):
    """Send password reset email with rate limiting"""
    # Rate limiting: max 3 attempts per hour per email
    email = request.email
    now = datetime.now(timezone.utc)
    
    if email in password_reset_attempts:
        # Clean old attempts (older than 1 hour)
        password_reset_attempts[email] = [
            ts for ts in password_reset_attempts[email]
            if (now - ts).total_seconds() < 3600
        ]
        
        if len(password_reset_attempts[email]) >= 3:
            raise HTTPException(
                status_code=429,
                detail="Troppi tentativi. Riprova tra 1 ora."
            )
    else:
        password_reset_attempts[email] = []
    
    password_reset_attempts[email].append(now)
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        # Don't reveal if email exists for security
        return {"message": "Se l'email esiste, riceverai un link per il reset della password"}
    
    # Generate reset token (valid for 1 hour)
    reset_token = str(uuid.uuid4())
    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Save token to database
    await db.password_resets.insert_one({
        "user_id": user["id"],
        "token": reset_token,
        "expiry": reset_expiry.isoformat(),
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Send email with reset link
    reset_url = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }}
            .button {{ display: inline-block; background: #38bdf8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }}
            .footer {{ text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚣 ROWING TESTS</h1>
                <p>Reset Password</p>
            </div>
            <div class="content">
                <h2>Ciao {user['name']},</h2>
                <p>Hai richiesto di reimpostare la tua password. Clicca sul pulsante qui sotto per procedere:</p>
                <div style="text-align: center;">
                    <a href="{reset_url}" class="button">Reimposta Password</a>
                </div>
                <p>Oppure copia e incolla questo link nel tuo browser:</p>
                <p style="background: white; padding: 15px; border-radius: 5px; word-break: break-all;">{reset_url}</p>
                <p><strong>Nota:</strong> Questo link è valido per 1 ora.</p>
                <p>Se non hai richiesto il reset della password, ignora questa email.</p>
            </div>
            <div class="footer">
                <p>© 2026 Rowing Tests - Gestione Test di Canottaggio</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    try:
        # Send email using Resend (non-blocking)
        email_params = {
            "from": SENDER_EMAIL,
            "to": [email],
            "subject": "Reset Password - Rowing Tests",
            "html": html_content
        }
        await asyncio.to_thread(resend.Emails.send, email_params)
    except Exception as e:
        logging.error(f"Failed to send reset email: {str(e)}")
        # Don't reveal email sending failure to user
    
    return {"message": "Se l'email esiste, riceverai un link per il reset della password"}

@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordResetConfirm):
    """Reset password with token"""
    # Find valid reset token
    reset_doc = await db.password_resets.find_one({
        "token": request.token,
        "used": False
    }, {"_id": 0})
    
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Token non valido o già utilizzato")
    
    # Check if token is expired
    expiry = datetime.fromisoformat(reset_doc["expiry"])
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail="Token scaduto")
    
    # Update password
    hashed_pw = hash_password(request.new_password)
    await db.users.update_one(
        {"id": reset_doc["user_id"]},
        {"$set": {"password": hashed_pw}}
    )
    
    # Mark token as used
    await db.password_resets.update_one(
        {"token": request.token},
        {"$set": {"used": True}}
    )
    
    return {"message": "Password aggiornata con successo"}

# ==================== SOCIETY ROUTES ====================

@api_router.post("/societies", response_model=Society)
async def create_society(society_data: SocietyCreate, current_user: dict = Depends(get_current_user)):
    # Only super admin can create societies
    if current_user["role"] != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Solo i Super Admin possono creare società")
    
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
async def get_users(user_status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    
    # Super admin can see all users
    if current_user["role"] == UserRole.SUPER_ADMIN:
        if user_status:
            query["status"] = user_status
    # Coaches can see users in their societies
    elif current_user["role"] == UserRole.COACH:
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not user or not user.get("society_ids"):
            return []
        query["society_ids"] = {"$in": user["society_ids"]}
        if user_status:
            query["status"] = user_status
    # Athletes see nothing via this endpoint
    else:
        return []
    
    users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.get("/users/pending", response_model=List[User])
async def get_pending_users(current_user: dict = Depends(get_current_user)):
    """Get all pending user registrations that current user can approve"""
    query = {"status": UserStatus.PENDING}
    
    if current_user["role"] == UserRole.SUPER_ADMIN:
        # Super admin sees all pending
        pass
    elif current_user["role"] == UserRole.COACH:
        # Coach sees pending athletes/coaches in their societies
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not user or not user.get("society_ids"):
            return []
        query["society_ids"] = {"$in": user["society_ids"]}
        query["role"] = {"$in": [UserRole.ATHLETE, UserRole.COACH]}
    else:
        return []
    
    users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.post("/users/{user_id}/approve")
async def approve_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Approve a pending user registration"""
    # Get the user to approve
    user_to_approve = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_to_approve:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    if user_to_approve.get("status") != UserStatus.PENDING:
        raise HTTPException(status_code=400, detail="L'utente non è in attesa di approvazione")
    
    # Check permissions
    current_user_doc = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    
    if current_user["role"] == UserRole.SUPER_ADMIN:
        # Super admin can approve anyone
        pass
    elif current_user["role"] == UserRole.COACH:
        # Coach can approve athletes/coaches in their societies
        if user_to_approve.get("role") not in [UserRole.ATHLETE, UserRole.COACH]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        
        # Check if they share a society
        coach_societies = set(current_user_doc.get("society_ids", []))
        user_societies = set(user_to_approve.get("society_ids", []))
        if not coach_societies.intersection(user_societies):
            raise HTTPException(status_code=403, detail="Non autorizzato ad approvare questo utente")
    else:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    # Approve user
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": UserStatus.APPROVED}}
    )
    
    return {"message": "Utente approvato con successo"}

@api_router.post("/users/{user_id}/reject")
async def reject_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Reject a pending user registration"""
    user_to_reject = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_to_reject:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    if user_to_reject.get("status") != UserStatus.PENDING:
        raise HTTPException(status_code=400, detail="L'utente non è in attesa di approvazione")
    
    # Check permissions (same as approve)
    current_user_doc = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    
    if current_user["role"] == UserRole.SUPER_ADMIN:
        pass
    elif current_user["role"] == UserRole.COACH:
        if user_to_reject.get("role") not in [UserRole.ATHLETE, UserRole.COACH]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        coach_societies = set(current_user_doc.get("society_ids", []))
        user_societies = set(user_to_reject.get("society_ids", []))
        if not coach_societies.intersection(user_societies):
            raise HTTPException(status_code=403, detail="Non autorizzato")
    else:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": UserStatus.REJECTED}}
    )
    
    return {"message": "Utente rifiutato"}

@api_router.post("/admin/recalculate-categories")
async def recalculate_all_categories(current_user: dict = Depends(get_current_user)):
    """Recalculate categories for all users with birth_year (run on Jan 1st)"""
    if current_user["role"] != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Solo i Super Admin possono ricalcolare le categorie")
    
    users_with_birth_year = await db.users.find(
        {"birth_year": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(10000)
    
    updated_count = 0
    for user in users_with_birth_year:
        new_category = calculate_category_from_birth_year(user["birth_year"])
        if user.get("category") != new_category:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"category": new_category}}
            )
            updated_count += 1
    
    return {
        "message": f"Categorie aggiornate per {updated_count} utenti",
        "total_users": len(users_with_birth_year),
        "updated": updated_count
    }

@api_router.post("/admin/cleanup-expired-tokens")
async def cleanup_expired_tokens(current_user: dict = Depends(get_current_user)):
    """Clean up expired password reset tokens"""
    if current_user["role"] != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Solo i Super Admin possono eseguire la pulizia")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Delete expired or used tokens
    result = await db.password_resets.delete_many({
        "$or": [
            {"expiry": {"$lt": now}},
            {"used": True}
        ]
    })
    
    return {
        "message": f"Pulizia completata: {result.deleted_count} token rimossi",
        "deleted_count": result.deleted_count
    }

@api_router.post("/users/{user_id}/set-designated-coach")
async def set_designated_coach(user_id: str, coach_id: Optional[str], current_user: dict = Depends(get_current_user)):
    """Set designated coach for a coach/super_admin to view their tests"""
    if current_user["role"] != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Solo i Super Admin possono impostare il coach designato")
    
    # Verify user exists and is coach/super_admin
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    if user["role"] not in [UserRole.COACH, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=400, detail="Solo coach e super admin possono avere un coach designato")
    
    # If coach_id provided, verify it's a valid coach
    if coach_id:
        coach = await db.users.find_one({"id": coach_id}, {"_id": 0})
        if not coach or coach["role"] != UserRole.COACH:
            raise HTTPException(status_code=404, detail="Coach non trovato")
    
    # Update designated coach
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"designated_coach_id": coach_id}}
    )
    
    return {"message": "Coach designato aggiornato con successo"}

@api_router.post("/athletes/{athlete_id}/request-society-change")
async def request_society_change(athlete_id: str, new_society_id: str, current_user: dict = Depends(get_current_user)):
    """Athlete requests to change society"""
    # Verify athlete is requesting for themselves
    if current_user["user_id"] != athlete_id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    athlete = await db.users.find_one({"id": athlete_id}, {"_id": 0})
    if not athlete or athlete["role"] != UserRole.ATHLETE:
        raise HTTPException(status_code=404, detail="Atleta non trovato")
    
    # Get new society
    new_society = await db.societies.find_one({"id": new_society_id}, {"_id": 0})
    if not new_society:
        raise HTTPException(status_code=404, detail="Società non trovata")
    
    # Create change request
    request_id = str(uuid.uuid4())
    request_doc = {
        "id": request_id,
        "athlete_id": athlete_id,
        "athlete_name": athlete["name"],
        "old_society_id": athlete.get("society_ids", [None])[0] if athlete.get("society_ids") else None,
        "new_society_id": new_society_id,
        "new_society_name": new_society["name"],
        "status": UserStatus.PENDING,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.society_change_requests.insert_one(request_doc)
    
    return {"message": "Richiesta di cambio società inviata", "request_id": request_id}

@api_router.get("/society-change-requests")
async def get_society_change_requests(current_user: dict = Depends(get_current_user)):
    """Get pending society change requests for coach's societies"""
    if current_user["role"] not in [UserRole.COACH, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    query = {"status": UserStatus.PENDING}
    
    if current_user["role"] == UserRole.COACH:
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not user or not user.get("society_ids"):
            return []
        # Coach sees requests for their societies
        query["new_society_id"] = {"$in": user["society_ids"]}
    
    requests = await db.society_change_requests.find(query, {"_id": 0}).to_list(1000)
    # Convert to simple dicts
    return [dict(r) for r in requests]

@api_router.post("/society-change-requests/{request_id}/approve")
async def approve_society_change(request_id: str, current_user: dict = Depends(get_current_user)):
    """Approve athlete society change request"""
    request = await db.society_change_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    
    if request["status"] != UserStatus.PENDING:
        raise HTTPException(status_code=400, detail="Richiesta già processata")
    
    # Check permissions
    if current_user["role"] == UserRole.COACH:
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not user or request["new_society_id"] not in user.get("society_ids", []):
            raise HTTPException(status_code=403, detail="Non autorizzato")
    elif current_user["role"] != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    # Update athlete's society
    await db.users.update_one(
        {"id": request["athlete_id"]},
        {"$set": {"society_ids": [request["new_society_id"]]}}
    )
    
    # Update request status
    await db.society_change_requests.update_one(
        {"id": request_id},
        {"$set": {"status": UserStatus.APPROVED}}
    )
    
    return {"message": "Cambio società approvato"}

@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ==================== TEST ROUTES ====================

@api_router.post("/tests", response_model=Test)
async def create_test(test_data: TestCreate, current_user: dict = Depends(get_current_user)):
    # Get person (athlete/coach/super_admin) info
    person = await db.users.find_one({"id": test_data.athlete_id}, {"_id": 0})
    if not person:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Check permissions
    if current_user["role"] == UserRole.ATHLETE:
        # Athletes can only add their own tests
        if current_user["user_id"] != test_data.athlete_id:
            raise HTTPException(status_code=403, detail="Gli atleti possono aggiungere solo i propri test")
    elif current_user["role"] == UserRole.COACH:
        # Coach can add tests for:
        # 1. Athletes in their societies
        # 2. Their own tests
        # 3. Tests for coaches in their societies
        if current_user["user_id"] != test_data.athlete_id:
            user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
            coach_societies = set(user.get("society_ids", []))
            person_societies = set(person.get("society_ids", []))
            if not coach_societies.intersection(person_societies):
                raise HTTPException(status_code=403, detail="Non autorizzato ad aggiungere test per questo utente")
    # Super admin can add tests for anyone
    
    # Calculate metrics
    split_500 = calculate_split_500(test_data.distance, test_data.time_seconds)
    watts = calculate_watts(split_500)
    
    weight = test_data.weight or person.get("weight", 0)
    watts_per_kg = calculate_watts_per_kg(watts, weight) if weight else None
    
    # Get person's primary society
    society_id = person.get("society_ids", [None])[0] if person.get("society_ids") else None
    
    test_id = str(uuid.uuid4())
    test_doc = {
        "id": test_id,
        "athlete_id": test_data.athlete_id,
        "athlete_name": person["name"],
        "society_id": society_id,
        "date": test_data.date,
        "distance": test_data.distance,
        "time_seconds": test_data.time_seconds,
        "split_500": split_500,
        "watts": watts,
        "watts_per_kg": watts_per_kg,
        "strokes": test_data.strokes,
        "weight": weight,
        "height": test_data.height or person.get("height"),
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
        # Coaches see tests from their societies
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if user and user.get("society_ids"):
            # Get all athletes in coach's societies
            athletes_in_societies = await db.users.find(
                {"society_ids": {"$in": user["society_ids"]}, "role": UserRole.ATHLETE},
                {"_id": 0}
            ).to_list(1000)
            athlete_ids = [a["id"] for a in athletes_in_societies]
            query["athlete_id"] = {"$in": athlete_ids}
    
    # Apply athlete filter if provided
    if athlete_id:
        query["athlete_id"] = athlete_id
    
    tests = await db.tests.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    return tests

@api_router.get("/tests/athlete/{athlete_id}/stats")
async def get_athlete_stats(athlete_id: str, current_user: dict = Depends(get_current_user)):
    # Get the user whose stats we're viewing
    target_user = await db.users.find_one({"id": athlete_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Check permissions
    can_view = False
    
    if current_user["user_id"] == athlete_id:
        # Can always view own stats
        can_view = True
    elif current_user["role"] == UserRole.SUPER_ADMIN:
        # Super admin can view anyone's stats
        can_view = True
    elif current_user["role"] == UserRole.COACH:
        # Coach can view:
        # 1. Athletes/coaches in their societies
        # 2. Coaches/super admins who designated them
        current_user_doc = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        coach_societies = set(current_user_doc.get("society_ids", []))
        target_societies = set(target_user.get("society_ids", []))
        
        if coach_societies.intersection(target_societies):
            can_view = True
        elif target_user.get("designated_coach_id") == current_user["user_id"]:
            can_view = True
    elif current_user["role"] == UserRole.ATHLETE:
        # Athletes can only view their own stats
        if current_user["user_id"] == athlete_id:
            can_view = True
    
    if not can_view:
        raise HTTPException(status_code=403, detail="Non autorizzato a visualizzare questi dati")
    
    # Get all tests for user
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