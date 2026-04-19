import React from "react";
import clsx from "clsx";

type Plan = "starter" | "growth" | "business";

const mockData = {
  plan: "growth" as Plan,
  status: "active",
  renewalDate: "2026-05-01",
  billingInterval: "monthly",
  usage: {
    connectors: { used: 2, limit: 3 },
    identities: { used: 120, limit: 200 },
    events: { used: 40000, limit: 100000 },
    retention: { used: 60, limit: 90 },
  },
};

const StatusPill = ({ status }: { status: string }) => (
  <span
    className={clsx(
      "px-3 py-1 text-xs rounded-full font-medium",
      status === "active"
        ? "bg-green-500/10 text-green-400 border border-green-500/20"
        : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    )}
  >
    {status.toUpperCase()}
  </span>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-[#0f172a] border border-white/5 rounded-xl p-5 shadow-xl">
    {children}
  </div>
);

const UsageBar = ({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) => {
  const percent = Math.round(Math.min((used / limit) * 100, 100));

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-gray-400">
        <span>{label}</span>
        <span>
          {used} / {limit}
        </span>
      </div>
      <div className="zf-billing-progress w-full bg-white/5 rounded-full h-2" data-progress={percent}>
        <div className="zf-billing-progress__fill h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />
      </div>
    </div>
  );
};

export default function BillingPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-white px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage your plan, usage, and billing settings
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusPill status={mockData.status} />
          <span className="px-3 py-1 text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
            {mockData.plan.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Card>
          <p className="text-sm text-gray-400">Current Plan</p>
          <h2 className="text-xl font-semibold mt-2 capitalize">{mockData.plan}</h2>
        </Card>

        <Card>
          <p className="text-sm text-gray-400">Next Renewal</p>
          <h2 className="text-xl font-semibold mt-2">{mockData.renewalDate}</h2>
        </Card>

        <Card>
          <p className="text-sm text-gray-400">Billing Cycle</p>
          <h2 className="text-xl font-semibold mt-2 capitalize">
            {mockData.billingInterval}
          </h2>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-medium mb-4">Usage & Limits</h3>

        <div className="grid md:grid-cols-2 gap-6">
          <UsageBar
            label="Connectors"
            used={mockData.usage.connectors.used}
            limit={mockData.usage.connectors.limit}
          />

          <UsageBar
            label="Identities"
            used={mockData.usage.identities.used}
            limit={mockData.usage.identities.limit}
          />

          <UsageBar
            label="Events / min"
            used={mockData.usage.events.used}
            limit={mockData.usage.events.limit}
          />

          <UsageBar
            label="Retention (days)"
            used={mockData.usage.retention.used}
            limit={mockData.usage.retention.limit}
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-medium mb-4">Current Subscription</h3>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Plan</p>
            <p className="mt-1 font-medium capitalize">{mockData.plan}</p>
          </div>

          <div>
            <p className="text-gray-400">Status</p>
            <p className="mt-1 font-medium uppercase">{mockData.status}</p>
          </div>

          <div>
            <p className="text-gray-400">Billing Interval</p>
            <p className="mt-1 font-medium capitalize">
              {mockData.billingInterval}
            </p>
          </div>

          <div>
            <p className="text-gray-400">Renewal Date</p>
            <p className="mt-1 font-medium">{mockData.renewalDate}</p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-4">
        <button className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition">
          Upgrade Plan
        </button>

        <button className="px-5 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition">
          Open Billing Portal
        </button>

        <button className="px-5 py-2 text-red-400 border border-red-400/20 hover:bg-red-500/10 rounded-lg transition">
          Cancel Subscription
        </button>
      </div>
    </div>
  );
}