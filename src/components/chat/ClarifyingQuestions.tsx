import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareMore, CheckCircle2, ChevronRight, Zap, ShieldCheck, Check } from "lucide-react";

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface ClarifyingQuestion {
  id: string;
  header: string;
  text: string;
  options: QuestionOption[];
  multiSelect?: boolean;
  allowOther?: boolean;
}

interface AnalysisBadges {
  needsBackend?: boolean;
  needsAuth?: boolean;
  complexity?: string;
}

interface ClarifyingQuestionsProps {
  questions: ClarifyingQuestion[];
  badges?: AnalysisBadges;
  onSubmit: (answers: Record<string, string | string[]>) => void;
  onSkip: () => void;
}

const ClarifyingQuestions = ({ questions, badges, onSubmit, onSkip }: ClarifyingQuestionsProps) => {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});

  const handleSelect = (questionId: string, value: string, multiSelect?: boolean) => {
    setAnswers(prev => {
      if (multiSelect) {
        const current = (prev[questionId] as string[]) || [];
        if (current.includes(value)) {
          return { ...prev, [questionId]: current.filter(v => v !== value) };
        }
        return { ...prev, [questionId]: [...current, value] };
      }
      return { ...prev, [questionId]: value };
    });
  };

  const isSelected = (questionId: string, value: string): boolean => {
    const answer = answers[questionId];
    if (Array.isArray(answer)) return answer.includes(value);
    return answer === value;
  };

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-3"
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/15 flex items-center justify-center shrink-0 mt-0.5">
          <MessageSquareMore className="w-3.5 h-3.5 text-accent" />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header text */}
          <p className="text-[13px] text-foreground leading-[1.7]">
            Before I build this, a few quick questions to make sure I get it right:
          </p>

          {/* Analysis badges */}
          {badges && (
            <div className="flex gap-2 flex-wrap">
              {badges.needsBackend && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-primary/8 text-primary/80 border border-primary/15">
                  <Zap className="w-2.5 h-2.5" /> Backend detected
                </span>
              )}
              {badges.needsAuth && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-accent/8 text-accent/80 border border-accent/15">
                  <ShieldCheck className="w-2.5 h-2.5" /> Auth needed
                </span>
              )}
              {badges.complexity && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  {badges.complexity} complexity
                </span>
              )}
            </div>
          )}

          {/* Question cards */}
          <div className="space-y-5">
            {questions.map((q, qi) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: qi * 0.08, duration: 0.3 }}
                className="space-y-2.5"
              >
                {/* Question header chip + text */}
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.06em] bg-primary/8 text-primary/70 border border-primary/12">
                    {q.header}
                  </span>
                  {q.multiSelect && (
                    <span className="shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium text-muted-foreground/60 bg-muted/50">
                      multi-select
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] font-medium text-foreground/90 leading-relaxed">{q.text}</p>

                {/* Option cards */}
                <div className="grid gap-2">
                  {q.options.map((opt, oi) => {
                    const selected = isSelected(q.id, opt.value);
                    return (
                      <motion.button
                        key={opt.value}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: qi * 0.08 + oi * 0.04, duration: 0.25 }}
                        onClick={() => handleSelect(q.id, opt.value, q.multiSelect)}
                        className={`
                          relative flex items-start gap-3 w-full px-4 py-3 rounded-xl text-left
                          border transition-all duration-200 group
                          ${selected
                            ? "border-primary/50 bg-primary/8 shadow-sm shadow-primary/5"
                            : "border-border/50 bg-card/40 hover:border-primary/30 hover:bg-primary/4"
                          }
                        `}
                      >
                        {/* Selection indicator */}
                        <div className={`
                          shrink-0 mt-0.5 w-[18px] h-[18px] rounded-md flex items-center justify-center transition-all
                          ${selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 border border-border/60 group-hover:border-primary/30"
                          }
                        `}>
                          {selected && <Check className="w-3 h-3" />}
                        </div>

                        {/* Text content */}
                        <div className="flex-1 min-w-0">
                          <span className={`text-[13px] font-semibold block leading-tight ${selected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"}`}>
                            {opt.label}
                          </span>
                          {opt.description && (
                            <span className={`text-[11px] mt-0.5 block leading-relaxed ${selected ? "text-foreground/60" : "text-muted-foreground/50 group-hover:text-muted-foreground/70"}`}>
                              {opt.description}
                            </span>
                          )}
                        </div>

                        {/* Arrow on hover */}
                        {!selected && (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/15 group-hover:text-primary/40 shrink-0 mt-1 transition-colors" />
                        )}
                      </motion.button>
                    );
                  })}

                  {/* Other / free text option */}
                  {q.allowOther !== false && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: qi * 0.08 + q.options.length * 0.04 }}
                    >
                      <button
                        onClick={() => handleSelect(q.id, "__other__", q.multiSelect)}
                        className={`
                          flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-left
                          border border-dashed transition-all duration-200
                          ${isSelected(q.id, "__other__")
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/40 hover:border-primary/25 hover:bg-muted/30"
                          }
                        `}
                      >
                        <div className={`
                          shrink-0 w-[18px] h-[18px] rounded-md flex items-center justify-center transition-all
                          ${isSelected(q.id, "__other__")
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/40 border border-border/50"
                          }
                        `}>
                          {isSelected(q.id, "__other__") && <Check className="w-3 h-3" />}
                        </div>
                        <span className="text-[12px] text-muted-foreground/60 font-medium">Other</span>
                      </button>
                      {isSelected(q.id, "__other__") && (
                        <motion.input
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          type="text"
                          placeholder="Type your preference..."
                          value={otherTexts[q.id] || ""}
                          onChange={(e) => setOtherTexts(prev => ({ ...prev, [q.id]: e.target.value }))}
                          className="mt-2 w-full px-3 py-2 rounded-lg text-[12px] bg-muted/40 border border-border/40 text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/15 transition-all"
                        />
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Progress + action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => onSubmit(answers)}
              disabled={answeredCount === 0}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-semibold
                transition-all duration-200 shadow-sm
                ${answeredCount > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
                }
              `}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {allAnswered ? "Build with these preferences" : `Continue (${answeredCount}/${questions.length})`}
            </button>
            <button
              onClick={onSkip}
              className="px-3 py-2.5 rounded-xl text-[12px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-all"
            >
              Skip, just build
            </button>

            {/* Answer progress dots */}
            <div className="flex gap-1 ml-auto">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                    answers[q.id] ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ClarifyingQuestions;
