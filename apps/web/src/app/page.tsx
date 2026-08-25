import Link from "next/link";
import { ShieldCheck, Cpu, Code2, BookOpen, UserCheck, ArrowRight, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/card";

export default function HomePage() {
  const features = [
    {
      title: "Security & Vulnerability Analysis",
      description: "Deep static application security testing detecting SQL injections, XSS, insecure deserialization, and authentication flaws.",
      icon: ShieldCheck,
      href: "/code-analysis",
      badge: "OWASP Top 10",
    },
    {
      title: "Multi-Provider AI Resilience",
      description: "Automated failover across Google Gemini, OpenAI GPT-4o, OpenRouter Claude, and Offline AST Rule Engines.",
      icon: Zap,
      href: "/code-analysis",
      badge: "Zero Downtime",
    },
    {
      title: "Repository Architecture Analysis",
      description: "Full-repo dependency graphing, cyclomatic complexity tracking, and maintainability scoring.",
      icon: Code2,
      href: "/repository-analysis",
      badge: "Multi-File",
    },
    {
      title: "Documentation Generator",
      description: "Generate production-grade API documentation, OpenAPI specifications, and markdown developer guides from raw code.",
      icon: BookOpen,
      href: "/documentation-generator",
      badge: "AI Powered",
    },
    {
      title: "Technical Interview Generator",
      description: "Formulate rigorous engineering interview questions and solution keys tailored to submitted source code.",
      icon: UserCheck,
      href: "/interview-generator",
      badge: "Hiring Intel",
    },
    {
      title: "Developer Analytics Dashboard",
      description: "Real-time vulnerability metrics, security scoring histograms, and complete audit history per user.",
      icon: Cpu,
      href: "/dashboard",
      badge: "Live Metrics",
    },
  ];

  return (
    <div className="flex flex-col gap-16 py-12">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-4xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold">
          <Zap className="h-3.5 w-3.5" />
          <span>CodeGuard AI v0.1.0 — Enterprise Multi-Provider AI Architecture</span>
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
          Next-Generation <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">AI Application Security</span> & Code Intelligence
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Audit code vulnerabilities, generate documentation, conduct architecture reviews, and maintain zero single-point-of-failure with our intelligent multi-provider engine.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link href="/code-analysis">
            <Button size="lg" className="gap-2">
              Start Free Analysis <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" size="lg">
              Explore Dashboard
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold">Platform Capabilities</h2>
          <p className="text-muted-foreground mt-2">Comprehensive suite of static analysis and AI-driven software intelligence tools.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <Card key={i} className="hover:border-primary/50 transition-colors flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full border bg-secondary text-secondary-foreground font-medium">
                    {f.badge}
                  </span>
                </div>
                <CardTitle className="mt-4">{f.title}</CardTitle>
                <CardDescription className="text-sm mt-2 leading-relaxed">
                  {f.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Link href={f.href}>
                  <Button variant="ghost" className="w-full justify-between mt-2 text-xs">
                    Launch Tool <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
