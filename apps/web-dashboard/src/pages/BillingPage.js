import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Badge, Button, Card } from '@/components/shared/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CreditCard, Zap, CheckCircle2, ArrowRight, TrendingUp, Shield, Clock, Database, Users, Wifi, ChevronRight, AlertTriangle, Star, ExternalLink, } from 'lucide-react';
// ─────────────────────────────────────────────
// USAGE METER BAR
// ─────────────────────────────────────────────
function UsageMeter({ label, current, limit, unit = '', warningAt = 80, }) {
    const isUnlimited = limit === 'unlimited' || typeof limit !== 'number';
    const pct = isUnlimited ? 0 : Math.min(Math.round((current / limit) * 100), 100);
    const barColor = pct >= 100 ? 'bg-red-500'
        : pct >= warningAt ? 'bg-yellow-500'
            : 'bg-blue-500';
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-1.5", children: [_jsx("span", { className: "text-sm text-gray-400", children: label }), _jsxs("span", { className: "text-sm font-medium text-gray-200", children: [current.toLocaleString(), unit, !isUnlimited && (_jsxs("span", { className: "text-gray-600", children: [" / ", limit.toLocaleString(), unit] })), isUnlimited && _jsx("span", { className: "text-gray-600", children: " / \u221E" })] })] }), _jsx("div", { className: "h-2 bg-gray-800 rounded-full overflow-hidden", children: isUnlimited ? (_jsx("div", { className: "h-full bg-green-500/40 w-full" })) : (_jsx("div", { className: clsx('h-full rounded-full transition-all duration-700', barColor), style: { width: `${pct}%` } })) }), pct >= warningAt && !isUnlimited && (_jsx("p", { className: clsx('text-xs mt-1', pct >= 100 ? 'text-red-400' : 'text-yellow-400'), children: pct >= 100 ? 'Limit reached — upgrade to continue' : `${pct}% of limit used` }))] }));
}
// ─────────────────────────────────────────────
// PLAN CARD
// ─────────────────────────────────────────────
function PlanCard({ plan, currentTier, billingCycle, onSelect, }) {
    const isCurrent = plan.tier === currentTier;
    const isFree = plan.monthlyPriceCents === 0;
    const isEnterprise = plan.tier === 'enterprise' || plan.tier === 'mssp';
    const price = billingCycle === 'annual'
        ? plan.annualPriceCents
        : plan.monthlyPriceCents;
    const displayPrice = price === 0 ? (isFree ? 'Free' : 'Contact sales')
        : `$${Math.floor(price / 100)}/mo`;
    const annualSavings = plan.monthlyPriceCents > 0 && plan.annualPriceCents > 0
        ? Math.round(((plan.monthlyPriceCents - plan.annualPriceCents) / plan.monthlyPriceCents) * 100)
        : 0;
    return (_jsxs("div", { className: clsx('relative flex flex-col rounded-2xl border p-6 transition-all', plan.highlighted
            ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10'
            : isCurrent
                ? 'border-green-500/40 bg-green-500/5'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'), children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [plan.highlighted && (_jsxs("span", { className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full\n                           text-xs font-bold bg-blue-500 text-white", children: [_jsx(Star, { className: "h-3 w-3" }), "Most Popular"] })), isCurrent && (_jsxs("span", { className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full\n                           text-xs font-bold bg-green-500/20 text-green-400", children: [_jsx(CheckCircle2, { className: "h-3 w-3" }), "Current Plan"] }))] }), _jsx("h3", { className: "text-lg font-bold text-gray-100 mb-1", children: plan.displayName }), _jsx("p", { className: "text-xs text-gray-500 mb-4", children: plan.description }), _jsxs("div", { className: "mb-6", children: [_jsxs("div", { className: "flex items-end gap-1", children: [_jsx("span", { className: "text-3xl font-bold text-gray-100", children: displayPrice }), !isFree && !isEnterprise && billingCycle === 'annual' && (_jsx("span", { className: "text-xs text-gray-500 mb-1", children: "billed annually" }))] }), annualSavings > 0 && billingCycle === 'annual' && (_jsxs("p", { className: "text-xs text-green-400 mt-1", children: ["Save ", annualSavings, "% vs monthly"] })), plan.trialDays > 0 && !isCurrent && !isFree && (_jsxs("p", { className: "text-xs text-blue-400 mt-1", children: [plan.trialDays, "-day free trial"] }))] }), _jsx("div", { className: "space-y-2 mb-6 pb-4 border-b border-gray-800", children: [
                    { label: 'Identities', value: plan.limits.identities, icon: Users },
                    { label: 'Connectors', value: plan.limits.connectors, icon: Wifi },
                    { label: 'Events/min', value: plan.limits.eventsPerMin, icon: Zap },
                    { label: 'Retention', value: `${plan.limits.retentionDays}d`, icon: Database },
                ].map(({ label, value, icon: Icon }) => (_jsxs("div", { className: "flex items-center gap-2 text-xs", children: [_jsx(Icon, { className: "h-3.5 w-3.5 text-gray-600 flex-shrink-0" }), _jsxs("span", { className: "text-gray-500", children: [label, ":"] }), _jsx("span", { className: clsx('font-medium ml-auto', value === 'unlimited' ? 'text-green-400' : 'text-gray-300'), children: value === 'unlimited' || value === 999999 ? 'Unlimited'
                                : typeof value === 'number' ? value.toLocaleString()
                                    : value })] }, label))) }), _jsx("ul", { className: "space-y-1.5 flex-1 mb-6", children: plan.features.slice(0, 6).map((f, i) => (_jsxs("li", { className: "flex items-start gap-2 text-xs", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-green-500/60 flex-shrink-0 mt-0.5" }), _jsx("span", { className: "text-gray-400", children: f })] }, i))) }), isCurrent ? (_jsx("div", { className: "text-center py-2.5 rounded-xl border border-green-500/20 text-sm text-green-400 font-medium", children: "\u2713 Active Plan" })) : isEnterprise ? (_jsxs("a", { href: "mailto:sales@zonforge.com", className: "flex items-center justify-center gap-2 py-2.5 rounded-xl\n                     border border-gray-700 text-sm text-gray-300 hover:text-white\n                     hover:border-gray-600 transition-colors", children: ["Contact Sales ", _jsx(ExternalLink, { className: "h-3.5 w-3.5" })] })) : (_jsx("button", { onClick: () => onSelect(plan.tier), className: clsx('w-full py-2.5 rounded-xl text-sm font-semibold transition-all', plan.highlighted
                    ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
                    : 'border border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-400'), children: isFree ? 'Start Free' : `Upgrade to ${plan.displayName}` }))] }));
}
// ─────────────────────────────────────────────
// BILLING PAGE
// ─────────────────────────────────────────────
export default function BillingPage() {
    const [billingCycle, setCycle] = useState('monthly');
    const [checkoutLoading, setCheckoutLoading] = useState(null);
    const { data: plansData, isLoading: plansLoading } = useQuery({
        queryKey: ['billing', 'plans'],
        queryFn: () => api.getPlans ? api.getPlans() : fetch('/api/v1/billing/plans').then(r => r.json()),
        staleTime: 60 * 60_000,
    });
    const { data: usageData, isLoading: usageLoading } = useQuery({
        queryKey: ['billing', 'usage'],
        queryFn: () => api.billing?.usage ? api.billing.usage() : fetch('/api/v1/billing/usage', {
            headers: { Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` },
        }).then(r => r.json()),
        staleTime: 5 * 60_000,
    });
    const { data: subData, isLoading: subLoading } = useQuery({
        queryKey: ['billing', 'subscription'],
        queryFn: () => fetch('/api/v1/billing/subscription', {
            headers: { Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` },
        }).then(r => r.json()),
        staleTime: 5 * 60_000,
    });
    const plans = plansData?.data ?? [];
    const usage = usageData?.data;
    const sub = subData?.data;
    const currentTier = usage?.planTier ?? 'starter';
    async function handleUpgrade(tier) {
        setCheckoutLoading(tier);
        try {
            const resp = await fetch('/api/v1/billing/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
                },
                body: JSON.stringify({ planTier: tier, billingCycle }),
            });
            const data = await resp.json();
            if (data.data?.url) {
                window.location.href = data.data.url;
            }
        }
        catch (err) {
            console.error('Checkout failed:', err);
        }
        finally {
            setCheckoutLoading(null);
        }
    }
    async function handlePortal() {
        const resp = await fetch('/api/v1/billing/portal', {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` },
        });
        const data = await resp.json();
        if (data.data?.url)
            window.location.href = data.data.url;
    }
    return (_jsx(AppShell, { title: "Plan & Billing", children: _jsxs(PageContent, { children: [_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8", children: [_jsx(Card, { className: "lg:col-span-2", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-300", children: "Current Plan" }), sub?.status === 'trialing' && (_jsx(Badge, { variant: "warning", size: "xs", children: "Trial" }))] }), _jsx("p", { className: "text-2xl font-bold text-gray-100 capitalize", children: usageLoading ? _jsx("span", { className: "opacity-0", children: "\u2014" })
                                                    : currentTier.charAt(0).toUpperCase() + currentTier.slice(1) }), sub?.trialEndsAt && new Date(sub.trialEndsAt) > new Date() && (_jsxs("p", { className: "text-sm text-yellow-400 mt-1 flex items-center gap-1.5", children: [_jsx(Clock, { className: "h-3.5 w-3.5" }), "Trial ends ", new Date(sub.trialEndsAt).toLocaleDateString()] })), sub?.currentPeriodEnd && sub.status !== 'trialing' && (_jsxs("p", { className: "text-xs text-gray-600 mt-1", children: [sub.cancelAtPeriodEnd ? 'Cancels' : 'Renews', ' ', new Date(sub.currentPeriodEnd).toLocaleDateString()] }))] }), _jsx(Button, { variant: "outline", size: "sm", icon: CreditCard, onClick: handlePortal, children: "Manage Billing" })] }) }), _jsxs(Card, { className: "flex flex-col justify-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Shield, { className: "h-4 w-4 text-blue-400" }), _jsx("span", { className: "text-sm font-semibold text-gray-300", children: "Support" })] }), _jsx("p", { className: "text-lg font-bold text-gray-100", children: currentTier === 'enterprise' || currentTier === 'mssp'
                                        ? 'Dedicated CSM'
                                        : currentTier === 'business'
                                            ? 'Priority Support'
                                            : 'Community' }), _jsx("p", { className: "text-xs text-gray-600", children: currentTier === 'enterprise' || currentTier === 'mssp'
                                        ? 'Custom SLA + 24/7 escalation'
                                        : currentTier === 'business'
                                            ? '4-hour response SLA'
                                            : 'Documentation + forums' })] })] }), usage && (_jsxs(Card, { className: "mb-8", children: [_jsxs("div", { className: "flex items-center justify-between mb-5", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200", children: "Current Usage" }), _jsx("span", { className: "text-xs text-gray-600", children: "Resets monthly" })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-5", children: [_jsx(UsageMeter, { label: "Data Connectors", current: usage.connectorsActive, limit: usage.planLimits.maxConnectors }), _jsx(UsageMeter, { label: "Monitored Identities", current: usage.identitiesMonitor, limit: usage.planLimits.maxIdentities }), _jsx(UsageMeter, { label: "Event Retention", current: usage.planLimits.retentionDays, limit: 365, unit: " days" }), _jsx(UsageMeter, { label: "Custom Detection Rules", current: 0, limit: usage.planLimits.maxCustomRules })] }), (usage.usagePct.connectors >= 80 || usage.usagePct.identities >= 80) && (_jsxs("div", { className: "mt-5 flex items-start gap-3 p-3 rounded-xl bg-yellow-500/8\n                              border border-yellow-500/20", children: [_jsx(AlertTriangle, { className: "h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" }), _jsx("p", { className: "text-xs text-yellow-300", children: "You're approaching your plan limits. Upgrade to avoid service interruptions." }), _jsxs("button", { onClick: () => document.getElementById('plans-section')?.scrollIntoView({ behavior: 'smooth' }), className: "ml-auto text-xs text-yellow-400 hover:underline flex-shrink-0 flex items-center gap-1", children: ["View plans ", _jsx(ChevronRight, { className: "h-3 w-3" })] })] }))] })), _jsxs("div", { id: "plans-section", children: [_jsxs("div", { className: "flex items-center justify-between mb-5", children: [_jsx("h3", { className: "text-lg font-bold text-gray-100", children: "Upgrade Your Plan" }), _jsx("div", { className: "flex items-center gap-1 p-1 rounded-xl bg-gray-800 border border-gray-700", children: ['monthly', 'annual'].map(cycle => (_jsxs("button", { onClick: () => setCycle(cycle), className: clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-all', billingCycle === cycle
                                            ? 'bg-gray-700 text-gray-200 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-400'), children: [cycle === 'monthly' ? 'Monthly' : 'Annual', cycle === 'annual' && (_jsx("span", { className: "ml-1.5 text-xs text-green-400 font-semibold", children: "-20%" }))] }, cycle))) })] }), plansLoading ? (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4", children: [...Array(5)].map((_, i) => (_jsx("div", { className: "h-96 rounded-2xl bg-gray-900 animate-pulse border border-gray-800" }, i))) })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4", children: plans.map(plan => (_jsx(PlanCard, { plan: plan, currentTier: currentTier, billingCycle: billingCycle, onSelect: handleUpgrade }, plan.tier))) }))] }), _jsx("div", { className: "mt-8 rounded-2xl border border-blue-500/15 bg-gradient-to-r\n                        from-blue-500/5 to-transparent p-6", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: "rounded-xl bg-blue-500/15 p-3", children: _jsx(TrendingUp, { className: "h-6 w-6 text-blue-400" }) }), _jsxs("div", { children: [_jsx("h4", { className: "text-base font-bold text-gray-100 mb-1", children: "Need a custom solution?" }), _jsx("p", { className: "text-sm text-gray-400 mb-4 max-w-lg", children: "For organizations with complex security requirements, compliance needs, or MSSP capabilities, we offer tailored pricing and dedicated infrastructure." }), _jsxs("a", { href: "mailto:sales@zonforge.com", className: "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl\n                           bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500\n                           transition-colors shadow-lg shadow-blue-500/20", children: ["Talk to Sales", _jsx(ArrowRight, { className: "h-4 w-4" })] })] })] }) })] }) }));
}
