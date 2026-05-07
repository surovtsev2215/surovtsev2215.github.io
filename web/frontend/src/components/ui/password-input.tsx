import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-12", className)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-10 w-10 hover:translate-y-0"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </Button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
