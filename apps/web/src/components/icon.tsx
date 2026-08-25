import { cn } from "@/lib/utils";
import {
  Shield,
  ChartBar,
  Activity,
  TrendingUp,
  GitBranch,
  FileText,
  PieChart,
  Clock,
  Code,
} from "lucide-react";

const iconMap = {
  shield: Shield,
  "chart-bar": ChartBar,
  activity: Activity,
  "trending-up": TrendingUp,
  "git-branch": GitBranch,
  "file-text": FileText,
  "pie-chart": PieChart,
  clock: Clock,
  code: Code,
};

type IconProps = {
  icon: keyof typeof iconMap;
  className?: string;
  size?: number;
};

export default function Icon({ icon, className = "", size = 24 }: IconProps) {
  const IconComponent = iconMap[icon];

  if (!IconComponent) {
    console.warn(`Lucide icon "${icon}" not found`);
    return null;
  }

  return (
    <IconComponent
      className={cn("h-[24px] w-[24px] shrink-0", className)}
      width={size}
      height={size}
    />
  );
}
