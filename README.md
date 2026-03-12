# Tutor AI

Study assistant with AI that helps **organize planning**, **stick to a routine**, and **study with per-subject support**. The user defines goals (e.g. ENEM, exams), subjects, topics, and minutes per day; the system generates goals and daily tasks, and offers chat with a tutor per subject, quiz, and progress tracking with gamification (XP, levels, achievements) and weekly insights.

**What the user can do:** complete onboarding with exam type and goals, see daily tasks in the Hub, mark completions and difficulty, use Pomodoro timer, chat with general or per-subject AI (with topic context), take quizzes by topic, edit plan and fixed commitments, and track progress via heatmap and weekly report.

**Project goal:** make studying more **organized**, **consistent**, and **effective**, with a tutor per subject and clear progress metrics—useful both for self-study and for academic or education research contexts.

## Prerequisites

1. Node.js 18+ installed
2. Firebase CLI installed: `npm install -g firebase-tools`
3. Google account for OAuth
4. Gemini API key: https://makersuite.google.com/app/apikey

---

## Setup

### 1. Firebase Console — Enable Google OAuth

```
1. Go to: https://console.firebase.google.com
2. Select project: tutor-ia-8a2fa
3. Menu: Authentication > Sign-in method
4. Click "Google" > Enable
5. Choose support email > Save
```

### 2. Create Environment Files

**web/.env.local**:
```env
VITE_TUTOR_ENDPOINT=http://localhost:5001/tutor-ia-8a2fa/us-central1/tutorChat
```

**functions/.env.local**:
```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash
```

---

## Run the App

### Terminal 1 (Frontend)
```bash
cd web
npm install
npm run dev
```

### Terminal 2 (Backend — Emulator)
```bash
firebase emulators:start
```

### Access
```
Frontend: http://localhost:5173
Firestore UI: http://localhost:4000
```

---

## Tests

### Automated Tests
```bash
cd web
npm test              
npm run test:ui       
npm run test:coverage 
```

Expected: 18 tests passing (100%)

### Basic Manual Test

1. Open http://localhost:5173
2. Click "Sign in with Google"
3. Complete onboarding:
   - Type: ENEM
   - Subject: Mathematics, topics: Trigonometry, Calculus
   - Priority: 2
   - Minutes: 120
4. See Hub with daily tasks
5. Mark a task as "Done" + difficulty
6. Check KPIs updating
7. Click "Chats by Subject" → Select "Mathematics"
8. Send a message and see specialized AI respond

---

## Data Structure

```
users/{uid}/
  ├─ profile/default (onboarding)
  ├─ goals/{goalId} + goals_summary/current
  ├─ schedule/{yyyy-mm-dd} (daily tasks)
  ├─ activity_log/ (logs with subject/topic)
  ├─ chats/{subject}/sessions/ (subject-specific chat)
  ├─ chat_sessions/ (general chat)
  └─ settings/preferences (theme)
```

## Useful Commands

```bash
# Development
npm run dev                
firebase emulators:start   

# Tests
npm test                  
npm run lint              

# Deploy
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only functions

# Logs
firebase functions:log    
```

---

## Additional Documentation

- firestore.rules — Security rules
- firestore.indexes.json — Composite indexes
- firestore.test.js — Security tests

---

## Support

For issues or questions, check:
1. Browser console (F12) — detailed logs
2. Firebase Console — rules and indexes
3. Terminal — backend errors
