import { PageHeader } from "../components/layout/AppShell";
import { EmptyState } from "../components/ui";

/** Named surfaces from the design that are not part of this milestone's scope. */
export function Placeholder({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px] p-5 md:p-8">
      <PageHeader title={title} />
      <EmptyState icon={icon} title={`${title} are on the roadmap`} description={description} />
    </div>
  );
}
