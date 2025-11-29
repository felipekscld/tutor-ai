// web/src/components/DifficultyFeedback.jsx
import { useState } from "react";
import { saveDifficultyFeedback, DIFFICULTY_REASONS } from "../lib/feedbackStore";
import { X, Send, AlertCircle } from "lucide-react";

export default function DifficultyFeedback({ 
  user, 
  subject, 
  topic, 
  difficulty, 
  onClose, 
  onSubmit,
  colors: C 
}) {
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleToggleReason = (reasonId) => {
    if (selectedReasons.includes(reasonId)) {
      setSelectedReasons(selectedReasons.filter(r => r !== reasonId));
    } else {
      setSelectedReasons([...selectedReasons, reasonId]);
    }
  };

  const handleSubmit = async () => {
    if (selectedReasons.length === 0 && !notes.trim()) {
      setError("Selecione pelo menos um motivo ou escreva um comentário");
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      await saveDifficultyFeedback(
        user.uid,
        subject,
        topic,
        difficulty,
        selectedReasons,
        notes.trim()
      );
      
      onSubmit?.();
      onClose();
    } catch (e) {
      console.error("Error saving feedback:", e);
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 24,
    }}>
      <div style={{
        background: C.panel,
        borderRadius: 20,
        padding: 28,
        maxWidth: 480,
        width: "100%",
        position: "relative",
      }}>
        {/* Close button */}
        <button
          onClick={handleSkip}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            padding: 8,
            borderRadius: 8,
            border: "none",
            background: C.panel2,
            color: C.textSecondary,
            cursor: "pointer",
          }}
        >
          <X size={18} />
        </button>
        
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: C.warning + "20",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}>
            <AlertCircle size={24} color={C.warning} />
          </div>
          
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            O que você achou difícil?
          </h3>
          <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5 }}>
            Seu feedback nos ajuda a personalizar melhor seu aprendizado.
          </p>
          
          {/* Topic info */}
          <div style={{
            marginTop: 12,
            padding: "10px 14px",
            background: C.panel2,
            borderRadius: 8,
            fontSize: 13,
          }}>
            <span style={{ color: C.textSecondary }}>Tópico: </span>
            <span style={{ fontWeight: 600 }}>{subject} - {topic}</span>
          </div>
        </div>
        
        {/* Reason options */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: C.textSecondary }}>
            Selecione os motivos (pode marcar mais de um):
          </div>
          
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DIFFICULTY_REASONS.map((reason) => {
              const isSelected = selectedReasons.includes(reason.id);
              
              return (
                <button
                  key={reason.id}
                  onClick={() => handleToggleReason(reason.id)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `2px solid ${isSelected ? C.accent : C.border}`,
                    background: isSelected ? C.accent + "15" : C.panel,
                    color: C.text,
                    cursor: "pointer",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span>{reason.icon}</span>
                  <span>{reason.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.textSecondary }}>
            Quer adicionar algo? (opcional)
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Não entendi como aplicar a fórmula nos exercícios..."
            rows={3}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.text,
              fontSize: 14,
              resize: "none",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>
        
        {/* Error */}
        {error && (
          <div style={{
            padding: 12,
            background: C.danger + "20",
            borderRadius: 8,
            color: C.danger,
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}
        
        {/* Actions */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={handleSkip}
            style={{
              flex: 1,
              padding: "14px 20px",
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.textSecondary,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Pular
          </button>
          
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              flex: 2,
              padding: "14px 20px",
              borderRadius: 10,
              border: "none",
              background: C.accent,
              color: "white",
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            <Send size={16} />
            {submitting ? "Enviando..." : "Enviar Feedback"}
          </button>
        </div>
        
        {/* Privacy note */}
        <p style={{
          fontSize: 11,
          color: C.textSecondary,
          textAlign: "center",
          marginTop: 16,
        }}>
          Este feedback é usado apenas para melhorar suas recomendações de estudo.
        </p>
      </div>
    </div>
  );
}

