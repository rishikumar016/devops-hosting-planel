import { useState, type FormEvent } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rocket } from "lucide-react";
import type { Deployment } from "@/types";

const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const IMAGE_RE = /^[a-z0-9._\-/]+(:[a-zA-Z0-9._-]+)?$/;

interface FormData {
  clientName: string;
  domain: string;
  image: string;
}

function validateLocal(form: FormData) {
  const errors: Partial<Record<keyof FormData, string>> = {};
  if (!form.clientName || form.clientName.trim().length < 2)
    errors.clientName = "At least 2 characters.";
  if (!DOMAIN_RE.test(String(form.domain).trim().toLowerCase()))
    errors.domain = "Looks invalid (e.g. app.example.com).";
  if (!IMAGE_RE.test(String(form.image).trim()))
    errors.image = "Use repo[:tag] (lowercase).";
  return errors;
}

interface OnboardingFormProps {
  onCreated: (deployment: Deployment) => void;
}

export default function OnboardingForm({ onCreated }: OnboardingFormProps) {
  const [form, setForm] = useState<FormData>({
    clientName: "",
    domain: "",
    image: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function update(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validateLocal(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setServerError(json.error || JSON.stringify(json.errors || json));
        setErrors(json.errors || {});
        return;
      }
      setForm({ clientName: "", domain: "", image: "" });
      onCreated(json.deployment);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="size-5" />
          Onboard Client
        </CardTitle>
        <CardDescription>
          Spins up the image on the host, registers the Caddy route, and runs
          the post-deploy Lambda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientName">Client name</Label>
            <Input
              id="clientName"
              autoComplete="off"
              placeholder="acme-corp"
              value={form.clientName}
              onChange={(e) => update("clientName", e.target.value)}
            />
            {errors.clientName && (
              <p className="text-sm text-destructive">{errors.clientName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              autoComplete="off"
              placeholder="app.acme.example.com"
              value={form.domain}
              onChange={(e) => update("domain", e.target.value)}
            />
            {errors.domain && (
              <p className="text-sm text-destructive">{errors.domain}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">Docker image</Label>
            <Input
              id="image"
              autoComplete="off"
              placeholder="nginx:1.27-alpine"
              value={form.image}
              onChange={(e) => update("image", e.target.value)}
            />
            {errors.image && (
              <p className="text-sm text-destructive">{errors.image}</p>
            )}
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Submitting…" : "Deploy"}
          </Button>

          {serverError && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
