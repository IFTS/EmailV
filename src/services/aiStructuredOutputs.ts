import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

export const emailCampaignSchema = {
  type: 'object',
  properties: {
    subject: { type: 'string', description: 'Email subject line, max 60 characters' },
    preheader: { type: 'string', description: 'Email preview text, max 100 characters' },
    body: { type: 'string', description: 'Plain text email body' },
    html: { type: 'string', description: 'HTML email body with proper tags' },
    cta: { type: 'string', description: 'Call-to-action button text' },
    ctaUrl: { type: 'string', description: 'URL for call-to-action' }
  },
  required: ['subject', 'body']
} as const;

export const seoAnalysisSchema = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    grade: { type: 'string', enum: ['A+', 'A', 'B', 'C', 'D', 'F'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['error', 'warning', 'info'] },
          code: { type: 'string' },
          message: { type: 'string' },
          element: { type: 'string' }
        },
        required: ['type', 'code', 'message']
      }
    },
    keywords: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } }
  },
  required: ['score', 'grade', 'issues']
} as const;

export const contactSegmentSchema = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          criteria: { type: 'string' },
          count: { type: 'number' },
          emails: { type: 'array', items: { type: 'string', format: 'email' } }
        },
        required: ['name', 'criteria', 'count']
      }
    }
  },
  required: ['segments']
} as const;

export const emailContentType = {
  name: 'email_campaign',
  description: 'Generate marketing email campaign content',
  schema: emailCampaignSchema
} as const;

export const seoAnalysisType = {
  name: 'seo_analysis',
  description: 'Analyze website SEO and provide recommendations',
  schema: seoAnalysisSchema
} as const;

export const contactSegmentType = {
  name: 'contact_segment',
  description: 'Segment contacts based on criteria',
  schema: contactSegmentSchema
} as const;

export async function generateStructuredEmailCampaign(
  context: string,
  type: string = 'promotional',
  tone: string = 'professional'
): Promise<{
  subject: string;
  preheader: string;
  body: string;
  html: string;
  cta: string;
  ctaUrl: string;
}> {
  const typePrompts: Record<string, string> = {
    welcome: 'Write a warm welcome email for new subscribers',
    promotional: 'Write a compelling promotional email with an offer',
    newsletter: 'Write an engaging newsletter with valuable content',
    announcement: 'Write an exciting product announcement',
    followup: 'Write a friendly follow-up email',
    confirmation: 'Write a clear order confirmation email',
    reengagement: 'Write an email to win back inactive users',
    survey: 'Write a feedback survey request email'
  };

  const toneInstructions: Record<string, string> = {
    professional: 'Use formal, business-appropriate language',
    friendly: 'Use warm, conversational tone',
    casual: 'Use relaxed, informal language',
    excited: 'Use enthusiastic, energetic language',
    empathetic: 'Use caring, understanding tone'
  };

  const prompt = `${typePrompts[type] || typePrompts.promotional}. ${toneInstructions[tone] || toneInstructions.professional}. Context: ${context}. Respond with valid JSON matching the schema.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      {
        role: 'system',
        content: 'You are an expert email marketer. Generate valid JSON output matching the provided schema. Never include any text outside the JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: emailContentType
    },
    temperature: 0.7,
    max_tokens: 2000
  });

  const content = response.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content generated');
  }

  try {
    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject || 'Newsletter',
      preheader: parsed.preheader || '',
      body: parsed.body || content,
      html: parsed.html || `<body><p>${parsed.body || content}</p></body>`,
      cta: parsed.cta || 'Learn More',
      ctaUrl: parsed.ctaUrl || '#'
    };
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    return {
      subject: 'Newsletter',
      preheader: '',
      body: content,
      html: `<body><p>${content}</p></body>`,
      cta: 'Learn More',
      ctaUrl: '#'
    };
  }
}

export async function generateSeoAnalysis(
  url: string,
  content: string
): Promise<{
  score: number;
  grade: string;
  issues: Array<{ type: string; code: string; message: string; element?: string }>;
  keywords: string[];
  recommendations: string[];
}> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      {
        role: 'system',
        content: 'You are an SEO expert. Analyze the website content and provide structured JSON output matching the schema.'
      },
      {
        role: 'user',
        content: `Analyze this website for SEO: ${url}\n\nContent:\n${content.substring(0, 5000)}`
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: seoAnalysisType
    },
    temperature: 0.3,
    max_tokens: 1500
  });

  const content_str = response.choices[0]?.message?.content;
  
  if (!content_str) {
    throw new Error('No content generated');
  }

  try {
    return JSON.parse(content_str);
  } catch (parseError) {
    return {
      score: 50,
      grade: 'C',
      issues: [{ type: 'error', code: 'PARSE_ERROR', message: 'Failed to parse SEO analysis' }],
      keywords: [],
      recommendations: ['Review content manually']
    };
  }
}

export async function segmentContacts(
  contacts: Array<{ email: string; name: string; company?: string; tags: string[] }>,
  goal: string
): Promise<{
  segments: Array<{
    name: string;
    criteria: string;
    count: number;
    emails: string[];
  }>;
}> {
  const contactSummary = contacts.slice(0, 100).map(c => ({
    email: c.email,
    name: c.name,
    company: c.company,
    tags: c.tags
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      {
        role: 'system',
        content: 'You are a customer segmentation expert. Create meaningful contact segments based on the provided data and goal. Output valid JSON matching the schema.'
      },
      {
        role: 'user',
        content: `Segment these contacts for: ${goal}\n\nContacts:\n${JSON.stringify(contactSummary, null, 2)}`
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: contactSegmentType
    },
    temperature: 0.5,
    max_tokens: 2000
  });

  const content = response.choices[0]?.message?.content;
  
  if (!content) {
    return { segments: [] };
  }

  try {
    return JSON.parse(content);
  } catch {
    return {
      segments: [{
        name: 'All Contacts',
        criteria: 'All imported contacts',
        count: contacts.length,
        emails: contacts.slice(0, 50).map(c => c.email)
      }]
    };
  }
}

export async function generateSubjectLines(
  content: string,
  count: number = 5
): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      {
        role: 'system',
        content: 'Generate creative email subject lines. Output JSON array of strings.'
      },
      {
        role: 'user',
        content: `Generate ${count} subject lines for: ${content}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 500
  });

  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    return parsed.subjectLines || parsed.lines || [];
  } catch {
    return [];
  }
}

export async function analyzeEmailPerformance(
  campaignData: {
    subject: string;
    body: string;
    openRate?: number;
    clickRate?: number;
  }
): Promise<{
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      {
        role: 'system',
        content: 'You are an email marketing analyst. Analyze email campaign performance and provide actionable insights. Output valid JSON.'
      },
      {
        role: 'user',
        content: `Analyze this email campaign:\nSubject: ${campaignData.subject}\nBody: ${campaignData.body.substring(0, 1000)}\nOpen Rate: ${campaignData.openRate || 'N/A'}\nClick Rate: ${campaignData.clickRate || 'N/A'}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_tokens: 1000
  });

  try {
    return JSON.parse(response.choices[0]?.message?.content || '{}');
  } catch {
    return {
      score: 70,
      strengths: ['Clear subject line'],
      weaknesses: ['Limited data'],
      suggestions: ['A/B test subject lines']
    };
  }
}
