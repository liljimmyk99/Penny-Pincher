import { FormField } from "@/components/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { GeneratePasswordButton } from "@/components/GeneratePasswordButton";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** A visible, monospace password field with a Generate button, for admins setting a password for someone else. */
export function PasswordField({ label, value, onChange, error }: Props) {
  return (
    <FormField label={label} description={`At least ${MIN_PASSWORD_LENGTH} characters.`} error={error}>
      {(control) => (
        <div className="flex gap-2">
          <Input
            {...control}
            className="min-w-0 flex-1 font-mono"
            value={value}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
          <GeneratePasswordButton onGenerate={onChange} />
        </div>
      )}
    </FormField>
  );
}

/** "Ask them to choose their own password", on by default in both dialogs. */
export function MustChangeCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      Ask them to choose their own password
    </label>
  );
}
