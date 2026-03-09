import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareMore, CheckCircle2, ChevronRight, ChevronLeft, Zap, ShieldCheck, Check, ArrowRight } from "lucide-react";

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

/* ── Sub-components ── */

const BadgeRow = ({ badges }: { badges: AnalysisBadges }) => (
  <div className="flex gap-2 flex-wrap mt-2">
    {badges.needsBackend && (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary/80 border border-primary/15">
        <Zap className="w-2.5 h-2.5" /> Backend
      </span>
    )}
    {badges.needsAuth && (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-accent/10 text-accent/80 border border-accent/15">
        <ShieldCheck className="w-2.5 h-2.5" /> Auth
      </span>
    )}
    {badges.complexity && (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
        {badges.complexity}
      </span>
    )}
  </div>
);

const OptionButton = ({
  opt,
  selected,
  index,
  onClick,
}: {
  opt: QuestionOption;
  selected: boolean;
  index: number;
  onClick: () => void;
}) => (
  <motion.button
    initial={{ opacity: 0, x: -4 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.04, duration: 0.2 }}
    onClick={onClick}
    className={`
      flex items-start gap-3 w-full px-4 py-3 rounded-xl text-left
      border transition-all duration-200 group
      ${selected
        ? "border-primary/50 bg-primary/8"
        : "border-border/40 bg-card/30 hover:border-primary/25 hover:bg-primary/4"
      }
    `}
  >
    <div className={`
      shrink-0 mt-0.5 w-[18px] h-[18px] rounded-md flex items-center justify-center transition-all
      ${selected
        ? "bg-primary text-primary-foreground"
        : "bg-muted/60 border border-border/60 group-hover:border-primary/30"
      }
    `}>
      {selected && <Check className="w-3 h-3" />}
    </div>
    <div className="flex-1 min-w-0">
      <span className={`text-sm font-medium block leading-tight ${selected ? "text-foreground" : "text-foreground/80"}`}>
        {opt.label}
      </span>
      {opt.description && (
        <span className={`text-xs mt-0.5 block leading-relaxed ${selected ? "text-foreground/60" : "text-muted-foreground/50"}`}>
          {opt.description}
        </span>
      )}
    </div>
  </motion.button>
);

/* ── Main component ── */

const ClarifyingQuestions = ({ questions, badges, onSubmit, onSkip }: ClarifyingQuestionsProps) => {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState(0);

  const handleSelect = useCallback((questionId: string, value: string, multiSelect?: boolean) => {
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

    // Auto-advance to next unanswered tab on single-select (after a brief delay for visual feedback)
    if (!multiSelect) {
      setTimeout(() => {
        setActiveTab(prev => {
          // Find next unanswered tab
          for (let i = prev + 1; i < questions.length; i++) {
            // We check the NEW answers state indirectly — if current tab just got answered,
            // look for the next one that doesn't have an answer yet
            // Since setAnswers is async, we trust that the current tab (prev) is now answered
            return i; // Just go to next tab
          }
          return prev; // Stay on current if it's the last
        });
      }, 250);
    }
  }, [questions.length]);

  const isSelected = useCallback((questionId: string, value: string): boolean => {
    const answer = answers[questionId];
    if (Array.isArray(answer)) return answer.includes(value);
    return answer === value;
  }, [answers]);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;
  const currentQ = questions[activeTab];

  const goNext = () => {
    if (activeTab < questions.length - 1) setActiveTab(activeTab + 1);
  };
  const goPrev = () => {
    if (activeTab > 0) setActiveTab(activeTab - 1);
  };

  // Build final answers including "other" text values
  const handleSubmit = useCallback(() => {
    const finalAnswers: Record<string, string | string[]> = {};
    for (const [qId, answer] of Object.entries(answers)) {
      if (Array.isArray(answer)) {
        finalAnswers[qId] = answer.map(v =>
          v === "__other__" ? (otherTexts[qId] || "Other") : v
        );
      } else if (answer === "__other__") {
        finalAnswers[qId] = otherTexts[qId] || "Other";
      } else {
        finalAnswers[qId] = answer;
      }
    }
    onSubmit(finalAnswers);
  }, [answers, otherTexts, onSubmit]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
            <MessageSquareMore className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-sm font-medium text-foreground">Quick questions before I build</span>
        </div>
        {badges && <BadgeRow badges={badges} />}
      </div>

      {/* Tab bar */}
      {questions.length > 1 && (
        <div className="flex border-b border-border/30">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setActiveTab(i)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all border-b-2 ${
                i === activeTab
                  ? "text-foreground border-primary"
                  : answers[q.id]
                    ? "text-[hsl(var(--ide-success))] border-transparent hover:bg-muted/10"
                    : "text-muted-foreground/50 border-transparent hover:text-foreground hover:bg-muted/10"
              }`}
            >
              {answers[q.id] ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-muted/60 text-[9px] flex items-center justify-center font-bold">
                  {i + 1}
                </span>
              )}
              <span className="truncate max-w-[80px]">{q.header}</span>
            </button>
          ))}
        </div>
      )}

      {/* Active question content */}
      {currentQ && (
        <div className="px-4 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQ.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <p className="text-sm font-medium text-foreground/90 leading-relaxed">{currentQ.text}</p>
              {currentQ.multiSelect && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium text-muted-foreground/60 bg-muted/50">
                  Select multiple
                </span>
              )}

              <div className="grid gap-2">
                {currentQ.options.map((opt, oi) => (
                  <OptionButton
                    key={opt.value}
                    opt={opt}
                    selected={isSelected(currentQ.id, opt.value)}
                    index={oi}
                    onClick={() => handleSelect(currentQ.id, opt.value, currentQ.multiSelect)}
                  />
                ))}

                {/* Other option */}
                {currentQ.allowOther !== false && (
                  <div>
                    <button
                      onClick={() => handleSelect(currentQ.id, "__other__", currentQ.multiSelect)}
                      className={`
                        flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-left
                        border border-dashed transition-all duration-200
                        ${isSelected(currentQ.id, "__other__")
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 hover:border-primary/25 hover:bg-muted/30"
                        }
                      `}
                    >
                      <div className={`
                        shrink-0 w-[18px] h-[18px] rounded-md flex items-center justify-center transition-all
                        ${isSelected(currentQ.id, "__other__")
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/40 border border-border/50"
                        }
                      `}>
                        {isSelected(currentQ.id, "__other__") && <Check className="w-3 h-3" />}
                      </div>
                      <span className="text-xs text-muted-foreground/60 font-medium">Other</span>
                    </button>
                    {isSelected(currentQ.id, "__other__") && (
                      <motion.input
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        type="text"
                        placeholder="Type your preference..."
                        value={otherTexts[currentQ.id] || ""}
                        onChange={(e) => setOtherTexts(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                        className="mt-2 w-full px-3 py-2 rounded-lg text-xs bg-muted/40 border border-border/40 text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/15 transition-all"
                      />
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/30 flex items-center gap-2">
        {questions.length > 1 && (
          <>
            <button
              onClick={goPrev}
              disabled={activeTab === 0}
              className="p-2 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted/20 disabled:opacity-20 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-muted-foreground/50 font-medium">
              {activeTab + 1} / {questions.length}
            </span>
            <button
              onClick={goNext}
              disabled={activeTab === questions.length - 1}
              className="p-2 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted/20 disabled:opacity-20 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* Progress dots */}
        <div className="flex gap-1 mr-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                answers[q.id] ? "bg-[hsl(var(--ide-success))]" : "bg-border"
              }`}
            />
          ))}
        </div>

        <button
          onClick={onSkip}
          className="px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-all"
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          disabled={answeredCount === 0}
          className={`
            flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
            transition-all duration-200
            ${answeredCount > 0
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
            }
          `}
        >
          {allAnswered ? (
            <>
              Build <ArrowRight className="w-3 h-3" />
            </>
          ) : (
            `Continue (${answeredCount}/${questions.length})`
          )}
        </button>
      </div>
    </motion.div>
  );
};

export default ClarifyingQuestions;
