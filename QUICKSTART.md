# Quick Start

## Pré-requisitos

1. Node.js 18+ instalado
2. Firebase CLI instalado: `npm install -g firebase-tools`
3. Conta Google para OAuth
4. Chave API do Gemini: https://makersuite.google.com/app/apikey

---

## Configuração 

### 1. Firebase Console - Ativar Google OAuth

```
1. Acesse: https://console.firebase.google.com
2. Selecione projeto: tutor-ia-8a2fa
3. Menu: Authentication > Sign-in method
4. Clique em "Google" > Enable
5. Escolha email de suporte > Save
```

### 2. Criar Arquivos de Ambiente

**web/.env.local**:
```env
VITE_TUTOR_ENDPOINT=http://localhost:5001/tutor-ia-8a2fa/us-central1/tutorChat
```

**functions/.env.local**:
```env
GEMINI_API_KEY=sua_chave_aqui
GEMINI_MODEL=gemini-2.0-flash
```

---

## Iniciar Aplicação

### Terminal 1 (Frontend)
```bash
cd web
npm install
npm run dev
```

### Terminal 2 (Backend - Emulador)
```bash
firebase emulators:start
```

### Acessar
```
Frontend: http://localhost:5173
Firestore UI: http://localhost:4000
```

---

## Testes

### Testes Automatizados
```bash
cd web
npm test              
npm run test:ui       
npm run test:coverage 
```

Esperado: 18 testes passando (100%)

### Teste Manual Básico

1. Abra http://localhost:5173
2. Clique "Entrar com Google"
3. Complete onboarding:
   - Tipo: ENEM
   - Matéria: Matemática, tópicos: Trigonometria, Cálculo
   - Prioridade: 2
   - Minutos: 120
4. Veja Hub com tarefas do dia
5. Marque uma tarefa como "Feito" + dificuldade
6. Verifique KPIs atualizando
7. Clique "Chats por Matéria" → Selecione "Matemática"
8. Envie mensagem e veja IA especializada responder

---

## Estrutura de Dados

```
users/{uid}/
  ├─ profile/default (onboarding)
  ├─ goals/{goalId} + goals_summary/current
  ├─ schedule/{yyyy-mm-dd} (tarefas do dia)
  ├─ activity_log/ (logs com subject/topic)
  ├─ chats/{subject}/sessions/ (chat especializado)
  ├─ chat_sessions/ (chat geral)
  └─ settings/preferences (tema)
```

## Comandos Úteis

```bash
# Desenvolvimento
npm run dev                
firebase emulators:start   

# Testes
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

## Documentação Adicional

- firestore.rules - Regras de segurança
- firestore.indexes.json - Índices compostos
- firestore.test.js - Testes de segurança

---

## Suporte

Para problemas ou dúvidas, verifique:
1. Console do browser (F12) - logs detalhados
2. Firebase Console - regras e índices
3. Terminal - erros de backend
