type Props = {
  title: string;
  value: string;
  description: string;
};

export function DashboardCard({ title, value, description }: Props) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="mt-2 text-3xl font-bold text-slate-900">{value}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}
