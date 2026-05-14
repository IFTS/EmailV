'use client';

import { useState, useEffect } from 'react';
import { 
  Users, Mail, BarChart3, Search, Bot, 
  Send, FileText, Plus, Trash2, Zap, 
  CheckCircle, XCircle, AlertCircle, Loader2
} from 'lucide-react';

interface Stats {
  contacts: number;
  validContacts: number;
  campaigns: number;
  seoAudits: number;
}

interface LogEntry {
  id: string;
  action: string;
  status: string;
  timestamp: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ contacts: 0, validContacts: 0, campaigns: 0, seoAudits: 0 });
  const [loading, setLoading] = useState(true);
  const [seoUrl, setSeoUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    try {
      const res = await fetch('/api/stats?tenantId=demo');
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  }

  async function runSeoAnalysis() {
    if (!seoUrl) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/seo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'demo', url: seoUrl })
      });
      const data = await res.json();
      if (data.success) {
        addLog('SEO Analysis completed', 'success');
      }
    } catch (e) {
      addLog('SEO Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  async function runAiAgent() {
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/create-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'demo',
          campaignName: 'AI Campaign',
          context: 'Generate a promotional email for our new product'
        })
      });
      const data = await res.json();
      if (data.success) {
        addLog('AI Campaign created', 'success');
      }
    } catch (e) {
      addLog('AI Campaign failed', 'error');
    } finally {
      setAiLoading(false);
    }
  }

  function addLog(message: string, status: string) {
    const entry: LogEntry = {
      id: Date.now().toString(),
      action: message,
      status,
      timestamp: new Date().toISOString()
    };
    setLogs(prev => [entry, ...prev.slice(0, 9)]);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-lg hover:bg-gray-800">
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-5 h-5 text-violet-400" />
              <span className="text-xs text-green-400">+12%</span>
            </div>
            <div className="text-2xl font-bold">{loading ? '...' : stats.contacts}</div>
            <div className="text-sm text-gray-500">Total Contacts</div>
          </div>

          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-2xl font-bold">{loading ? '...' : stats.validContacts}</div>
            <div className="text-sm text-gray-500">Valid Emails</div>
          </div>

          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <Send className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold">{loading ? '...' : stats.campaigns}</div>
            <div className="text-sm text-gray-500">Campaigns</div>
          </div>

          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <Search className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-2xl font-bold">{loading ? '...' : stats.seoAudits}</div>
            <div className="text-sm text-gray-500">SEO Audits</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-400" />
              SEO Analyzer
            </h2>
            <div className="flex gap-2">
              <input
                type="url"
                value={seoUrl}
                onChange={(e) => setSeoUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
              />
              <button
                onClick={runSeoAnalysis}
                disabled={analyzing || !seoUrl}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-2"
              >
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Analyze
              </button>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              AI Marketing Agent
            </h2>
            <button
              onClick={runAiAgent}
              disabled={aiLoading}
              className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              Generate AI Campaign
            </button>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            Activity Log
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No activity yet</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 p-2 rounded bg-gray-800/50">
                  {log.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : log.status === 'error' ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                  )}
                  <span className="flex-1">{log.action}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
