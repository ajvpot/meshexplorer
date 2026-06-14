"use client";
import { useRegions, useRegionGroups } from "@/hooks/useRegions";

interface RegionSelectProps {
  /** Current selector value (region code, group code, or '' for all). */
  value: string;
  /** Called with the raw selector string ('' when "All Regions" is picked). */
  onChange: (value: string) => void;
  className?: string;
  allLabel?: string;
}

/**
 * Shared region/group dropdown. Lists region groups and dynamically-discovered regions in
 * separate <optgroup>s. The selected value is a "selector" (a region code or a group code).
 */
export default function RegionSelect({
  value,
  onChange,
  className,
  allLabel = "All Regions",
}: RegionSelectProps) {
  const { regions } = useRegions();
  const { groups } = useRegionGroups();

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{allLabel}</option>
      {groups.length > 0 && (
        <optgroup label="Groups">
          {groups.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </optgroup>
      )}
      {regions.length > 0 && (
        <optgroup label="Regions">
          {regions.map((r) => (
            <option key={r.name} value={r.name}>
              {r.friendlyName}
              {typeof r.nodeCount === "number" ? ` (${r.nodeCount})` : ""}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
