import type { Metadata } from "next";
import { OrgChartStudio } from "./orgchart-studio";

export const metadata: Metadata = {
  title: { absolute: "ORNL OrgChart Studio — Technical Prototype" },
  description:
    "A governed, data-first organizational chart authoring and review prototype.",
};

export default function Home() {
  return <OrgChartStudio />;
}
