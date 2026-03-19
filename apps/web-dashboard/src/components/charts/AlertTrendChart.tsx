import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { format, subDays } from 'date-fns'

// ─────────────────────────────────────────────
// 30-DAY ALERT TREND CHART
// ─────────────────────────────────────────────

interface TrendDataPoint {
  date:     string
  critical: number
  high:     number
  medium:   number
}

interface AlertTrendChartProps {
  data?:    TrendDataPoint[]
  loading?: boolean
}

// Mock data generator for UI preview when real data loads
function generateMockTrend(): TrendDataPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const date = subDays(new Date(), 29 - i)
    return {
      date:     format(date, 'MMM d'),
      critical: Math.floor(Math.random() * 3),
      high:     Math.floor(Math.random() * 8) + 1,
      medium:   Math.floor(Math.random() * 15) + 2,
    }
  })
}

const CustomTooltip = ({
  active, payload, label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?:   string
}) => {
  if (!active || !payload?.length) return null

  return (
    <div className="card-sm px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-gray-400 mb-2">{label}</p>
      {payload.map(entry => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-400 capitalize">{entry.name}</span>
          </span>
          <span className="font-mono font-semibold text-gray-200">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function AlertTrendChart({ data, loading }: AlertTrendChartProps) {
  const chartData = data ?? generateMockTrend()

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-700 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <defs>
          <linearGradient id="critical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="high" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ea580c" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="medium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />

        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={6}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />

        <Tooltip content={<CustomTooltip />} />

        <Area
          type="monotone"
          dataKey="critical"
          stroke="#dc2626"
          strokeWidth={1.5}
          fill="url(#critical)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="high"
          stroke="#ea580c"
          strokeWidth={1.5}
          fill="url(#high)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="medium"
          stroke="#f59e0b"
          strokeWidth={1.5}
          fill="url(#medium)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
