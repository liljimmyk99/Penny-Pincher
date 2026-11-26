import { Button } from "@/components/ui/button";
import { generatePassword } from "@/lib/password";

/**
 * Fills a password field with a random password that meets the rules (#201), for
 * the admin Add user and Reset password dialogs. The value goes only to
 * `onGenerate`: it is never stored, logged or put in a URL.
 */
export function GeneratePasswordButton({ onGenerate }: { onGenerate: (password: string) => void }) {
  return (
    <Button type="button" variant="outline" onClick={() => onGenerate(generatePassword())}>
      Generate
    </Button>
  );
}
