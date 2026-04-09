"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Insight {
  pattern: string;
  metric: string;
  recommendation: string;
}

export function InsightsWidget() {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchInsights() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/ai/insights");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Inzichten ophalen mislukt");
      }

      const data = await res.json();
      if (data.message) {
        setMessage(data.message);
        setInsights([]);
      } else {
        setInsights(data.insights);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent" />
          <h3 className="font-semibold">Outreach Inzichten</h3>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchInsights}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {loading ? "Analyseren..." : insights ? "Ververs" : "Analyseer"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {message && (
        <p className="text-sm text-muted">{message}</p>
      )}

      {!insights && !loading && !error && (
        <p className="text-sm text-muted">
          Klik op &quot;Analyseer&quot; om AI-inzichten te genereren op basis van je outreach resultaten.
        </p>
      )}

      {insights && insights.length > 0 && (
        <div className="space-y-4">
          {insights.map((insight, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {insight.metric.includes("hoog") || insight.metric.includes(">") || insight.metric.includes("stijg") ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{insight.pattern}</p>
                <p className="text-xs text-accent">{insight.metric}</p>
                <p className="text-xs text-muted">{insight.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
