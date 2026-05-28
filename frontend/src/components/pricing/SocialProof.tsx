import { Building2, Calculator, BookOpen, Database } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ProofItem {
  icon: React.ReactNode;
  num: string;
  label: string;
}

const PROOFS: ProofItem[] = [
  {
    icon: <Building2 className="w-6 h-6 text-accent-blue" aria-hidden />,
    num: "6만+",
    label: "단지 데이터",
  },
  {
    icon: <Calculator className="w-6 h-6 text-accent-green" aria-hidden />,
    num: "5종",
    label: "부동산 계산기",
  },
  {
    icon: <BookOpen className="w-6 h-6 text-accent-terracotta" aria-hidden />,
    num: "26편",
    label: "전문 가이드",
  },
  {
    icon: <Database className="w-6 h-6 text-accent-blue" aria-hidden />,
    num: "6종",
    label: "공공 데이터",
  },
];

export function SocialProof() {
  return (
    <section className="bg-bg-light border border-neutral-light rounded-xl p-6 sm:p-8">
      <h2 className="text-base sm:text-lg font-bold text-text-primary text-center mb-6">
        이미 준비된 데이터·도구
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {PROOFS.map((p) => (
          <Card
            key={p.label}
            size="sm"
            className="bg-white ring-0 border border-neutral-light/60 text-center"
          >
            <div className="flex justify-center mb-1">{p.icon}</div>
            <p className="text-xl sm:text-2xl font-bold text-text-primary">{p.num}</p>
            <p className="text-xs text-gray-600 mt-1">{p.label}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
