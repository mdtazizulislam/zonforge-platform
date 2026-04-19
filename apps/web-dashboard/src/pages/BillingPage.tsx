import React from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";

const StatusPill = ({ status }: { status?: string | null }) => (
  <span
    className={clsx(
      "px-3 py-1 text-xs rounded-full font-medium",
      status === "active"
        ? "bg-green-500/10 text-green-400 border border-green-500/20"
        : status === "loading"
          ? "bg-slate-500/10 text-slate-300 border border-slate-500/20"
          : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    )}
  >
    {String(status ?? "unknown").toUpperCase()}
  </span>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-[#0f172a] border border-white/5 rounded-xl p-5 shadow-xl">
    {children}
  </div>
);

function formatLimit(value: number | null | undefined) {
  return value == null ? "Unlimited" : value.toLocaleString();
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Not scheduled";
}

export default function BillingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing.subscription,
    staleTime: 15000,
  });

  const subscription = data?.subscription;
  const status = subscription?.status ?? (isLoading ? "loading" : "unconfigured");
  const limitCards = [
    { label: "Connectors", value: formatLimit(subscription?.limits?.max_connectors) },
    { label: "Identities", value: formatLimit(subscription?.limits?.max_identities) },
    { label: "Events / min", value: formatLimit(subscription?.limits?.events_per_minute) },
    { label: "Retention (days)", value: formatLimit(subscription?.limits?.retention_days) },
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-white px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
          <p className="text-gray-400 text-sm mt-1">
            Live tenant billing state, plan limits, and subscription readiness.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <span className="px-3 py-1 text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full">
            {(subscription?.planName ?? "No active plan").toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Card>
          <p className="text-sm text-gray-400">Current Plan</p>
          <h2 className="text-xl font-semibold mt-2">{subscription?.planName ?? "No active plan"}</h2>
        </Card>

        <Card>
          <p className="text-sm text-gray-400">Next Renewal</p>
          <h2 className="text-xl font-semibold mt-2">{formatDate(subscription?.currentPeriodEnd)}</h2>
        </Card>

        <Card>
          <p className="text-sm text-gray-400">Billing Cycle</p>
          <h2 className="text-xl font-semibold mt-2 capitalize">
            {subscription?.billingInterval ?? "Not set"}
          </h2>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-medium mb-4">Plan Limits</h3>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          {limitCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-white/5 bg-slate-950/70 px-4 py-4">
              <p className="text-gray-400">{card.label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{card.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-medium mb-4">Current Subscription</h3>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Plan Code</p>
            <p className="mt-1 font-medium uppercase">{subscription?.planCode ?? "none"}</p>
          </div>

          <div>
            <p className="text-gray-400">Status</p>
            <p className="mt-1 font-medium uppercase">{status}</p>
          </div>

          <div>
            <p className="text-gray-400">Current Period Start</p>
            <p className="mt-1 font-medium">{formatDate(subscription?.currentPeriodStart)}</p>
          </div>

          <div>
            <p className="text-gray-400">Current Period End</p>
            <p className="mt-1 font-medium">{formatDate(subscription?.currentPeriodEnd)}</p>
          </div>
        </div>

        {!subscription && !isLoading ? (
          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
            Billing is active in the app shell, but no tenant subscription is currently attached to this session.
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-4">
        <button type="button" className="px-5 py-2 bg-indigo-600 rounded-lg font-medium transition opacity-80">
          Upgrade Plan
        </button>

        <button type="button" className="px-5 py-2 bg-white/5 rounded-lg border border-white/10 transition opacity-80">
          Open Billing Portal
        </button>
      </div>
    </div>
  );
}