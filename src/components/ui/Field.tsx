import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-xl border bg-white px-3.5 text-[0.95rem] text-cocoa-900 placeholder:text-cocoa-400 " +
  "transition-colors focus:outline-none focus:ring-2 focus:ring-caramel-400/40 disabled:bg-cream-100 disabled:text-cocoa-500";

function borderFor(error?: string) {
  return error ? "border-berry-600 focus:border-berry-600" : "border-cream-300 focus:border-caramel-500";
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-cocoa-800">
        {label}
        {optional && <span className="ml-1 font-normal text-cocoa-500">(opcional)</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-cocoa-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-berry-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { error?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, error, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-11", borderFor(error), className)} aria-invalid={error ? true : undefined} {...props} />;
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, error, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(control, "min-h-24 py-2.5", borderFor(error), className)}
      aria-invalid={error ? true : undefined}
      {...props}
    />
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { error?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, error, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, "h-11 pr-8", borderFor(error), className)} aria-invalid={error ? true : undefined} {...props}>
      {children}
    </select>
  );
});

interface ChoiceCardProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  aside?: ReactNode;
}

export function ChoiceCard({ name, value, checked, onChange, title, description, icon, disabled, aside }: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition-colors",
        checked ? "border-cocoa-900 ring-1 ring-cocoa-900" : "border-cream-300 hover:border-cocoa-400",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-1 size-4 accent-cocoa-900"
      />
      {icon && <span className="mt-0.5 text-cocoa-700">{icon}</span>}
      <span className="flex-1">
        <span className="block font-semibold text-cocoa-900">{title}</span>
        {description && <span className="mt-0.5 block text-sm text-cocoa-600">{description}</span>}
      </span>
      {aside && <span className="text-sm font-semibold text-cocoa-900">{aside}</span>}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, description }: { label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-cocoa-900" />
      <span className="text-sm text-cocoa-800">
        {label}
        {description && <span className="block text-xs text-cocoa-500">{description}</span>}
      </span>
    </label>
  );
}
