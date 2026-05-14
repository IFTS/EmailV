import Link from 'next/link';
import { Mail, Users, BarChart3, Sparkles, Search, Bot } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="max-w-4xl text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600">
            <Mail className="w-10 h-10 text-white" />
          </div>
        </div>
        
        <h1 className="text-5xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-4">
          EmailV Pro
        </h1>
        
        <p className="text-xl text-gray-400 mb-8">
          Enterprise multi-tenant SaaS marketing platform with AI-powered campaigns
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <Link href="/dashboard" className="group p-6 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-violet-500 transition-all">
            <Users className="w-8 h-8 mx-auto mb-3 text-violet-400" />
            <h3 className="font-semibold mb-1">Contacts App</h3>
            <p className="text-sm text-gray-500">Manage contacts with validation</p>
          </Link>
          
          <Link href="/dashboard" className="group p-6 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-indigo-500 transition-all">
            <Search className="w-8 h-8 mx-auto mb-3 text-indigo-400" />
            <h3 className="font-semibold mb-1">SEO Analyzer</h3>
            <p className="text-sm text-gray-500">Core Web Vitals scoring</p>
          </Link>
          
          <Link href="/dashboard" className="group p-6 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-purple-500 transition-all">
            <Bot className="w-8 h-8 mx-auto mb-3 text-purple-400" />
            <h3 className="font-semibold mb-1">AI Agent</h3>
            <p className="text-sm text-gray-500">GPT-4 powered campaigns</p>
          </Link>
        </div>

        <Link 
          href="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 transition-opacity"
        >
          <BarChart3 className="w-5 h-5" />
          Open Dashboard
        </Link>
      </div>
    </main>
  );
}
