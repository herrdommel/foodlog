import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalysisDto } from '@foodlog/shared';
import { ingredientName } from '../lib/format.ts';
import { Card } from './ui.tsx';

const axisStyle = { fontSize: 12, fill: 'var(--text)' };

function ChartFrame({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <div role="img" aria-label={label} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function SymptomsPerDayChart({ data }: { data: AnalysisDto['symptomsByDay'] }) {
  const { t } = useTranslation();
  const total = data.reduce((sum, day) => sum + day.count, 0);
  return (
    <Card title={t('analysis.charts.symptomsPerDay')}>
      {total === 0 ? (
        <p className="text-fg/75">{t('analysis.charts.noData')}</p>
      ) : (
        <ChartFrame label={t('analysis.charts.symptomsPerDay')}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--text)" strokeOpacity={0.15} />
            <XAxis
              dataKey="date"
              tick={axisStyle}
              tickFormatter={(value: string) => value.slice(5)}
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={axisStyle} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--text)',
                borderRadius: 8,
              }}
              labelStyle={{ color: 'var(--text)' }}
              itemStyle={{ color: 'var(--text)' }}
            />
            <Bar
              isAnimationActive={false}
              dataKey="count"
              name={t('analysis.charts.count')}
              fill="var(--highlight)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartFrame>
      )}
    </Card>
  );
}

export function BristolChart({ data }: { data: number[] }) {
  const { t } = useTranslation();
  const rows = data.map((count, index) => ({ type: String(index + 1), count }));
  const total = data.reduce((sum, value) => sum + value, 0);
  return (
    <Card title={t('analysis.charts.bristol')}>
      {total === 0 ? (
        <p className="text-fg/75">{t('analysis.charts.noData')}</p>
      ) : (
        <ChartFrame label={t('analysis.charts.bristol')}>
          <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--text)" strokeOpacity={0.15} />
            <XAxis dataKey="type" tick={axisStyle} />
            <YAxis allowDecimals={false} tick={axisStyle} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--text)',
                borderRadius: 8,
              }}
              labelStyle={{ color: 'var(--text)' }}
              itemStyle={{ color: 'var(--text)' }}
            />
            <Bar
              isAnimationActive={false}
              dataKey="count"
              name={t('analysis.charts.count')}
              fill="var(--accent)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartFrame>
      )}
    </Card>
  );
}

export function TopIngredients({ data }: { data: AnalysisDto['topIngredients'] }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <Card title={t('analysis.charts.topIngredients')}>
      {data.length === 0 ? (
        <p className="text-fg/75">{t('analysis.charts.noData')}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((item) => (
            <li
              key={item.ingredient.id}
              className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm"
            >
              <span className="truncate">{ingredientName(item.ingredient, i18n.language)}</span>
              <span
                aria-hidden="true"
                className="h-3 rounded-full bg-accent"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
              <span className="text-right tabular-nums">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Heatmap({ data }: { data: number[][] }) {
  const { t } = useTranslation();
  const weekdays = t('analysis.charts.weekdays', { returnObjects: true }) as string[];
  const max = Math.max(1, ...data.flat());
  const total = data.flat().reduce((sum, value) => sum + value, 0);
  return (
    <Card title={t('analysis.charts.heatmap')}>
      {total === 0 ? (
        <p className="text-fg/75">{t('analysis.charts.noData')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <td />
                {Array.from({ length: 24 }, (_, hour) => (
                  <th key={hour} scope="col" className="w-5 font-normal text-fg/75">
                    {hour % 3 === 0 ? hour : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, day) => (
                <tr key={day}>
                  <th scope="row" className="pr-2 text-left font-normal text-fg/75">
                    {weekdays[day]}
                  </th>
                  {row.map((count, hour) => (
                    <td
                      key={hour}
                      title={`${weekdays[day]} ${hour}:00 – ${count}`}
                      className="h-5 w-5 rounded-sm bg-fg/5"
                      style={
                        count
                          ? {
                              backgroundColor: 'var(--highlight)',
                              opacity: 0.25 + 0.75 * (count / max),
                            }
                          : undefined
                      }
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
