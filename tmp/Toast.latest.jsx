import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Info, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

const ToastContext = createContext();

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  const addToast = (message, type = "info", duration = 3000) => {
    const id = toastIdCounter.current++;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const value = { addToast };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed top-4 right-4 z-[1000] w-full max-w-sm space-y-2">
          {toasts.map(({ id, message, type }) => (
            <div
              key={id}
              className={clsx(
                "animate-fade-in-right flex items-center p-4 rounded-lg shadow-lg text-white",
                type === "success" && "bg-[var(--color-success)]",
                type === "error" && "bg-[var(--color-danger)]",
                type === "warning" && "bg-[var(--color-warning)]",
                type === "info" && "bg-[var(--color-primary)]"
              )}
              role="alert"
            >
              <div className="flex-shrink-0 mr-3">
                {type === "success" && <CheckCircle className="h-5 w-5" />}
                {type === "error" && <XCircle className="h-5 w-5" />}
                {type === "warning" && <AlertTriangle className="h-5 w-5" />}
                {type === "info" && <Info className="h-5 w-5" />}
              </div>
              <div className="flex-1 text-sm font-medium">{message}</div>
              <button
                onClick={() => removeToast(id)}
                className="ml-auto -mx-1.5 -my-1.5 bg-transparent text-white rounded-lg p-1.5 inline-flex items-center justify-center h-8 w-8 hover:bg-white hover:bg-opacity-20 transition-colors"
                aria-label="Close"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export { ToastProvider, useToast };