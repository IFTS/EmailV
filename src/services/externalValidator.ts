import axios from 'axios';
import { validateEmail } from './emailValidator.js';

export interface ExternalValidationResult {
  email: string;
  result: 'valid' | 'invalid' | 'catch-all' | 'unknown' | 'spam-trap' | 'do-not-mail';
  score: number;
  disposable: boolean;
  free: boolean;
  role: boolean;
  verifiedAt?: Date;
  source: string;
}

abstract class BaseValidator {
  abstract name: string;
  abstract baseUrl: string;
  abstract apiKey: string;
  
  async verify(email: string): Promise<ExternalValidationResult | null> {
    throw new Error('Not implemented');
  }
  
  protected parseResponse(email: string, data: any): ExternalValidationResult {
    throw new Error('Not implemented');
  }
}

class ZeroBounceValidator extends BaseValidator {
  name = 'ZeroBounce';
  baseUrl = 'https://api.zerobounce.net/v2';
  apiKey = process.env.ZEROBOUNCE_API_KEY || '';
  
  async verify(email: string): Promise<ExternalValidationResult | null> {
    if (!this.apiKey) return null;
    
    try {
      const response = await axios.get(`${this.baseUrl}/validate`, {
        params: { email, api_key: this.apiKey }
      });
      
      return {
        email,
        result: response.data.status === 'valid' ? 'valid' : 
               response.data.status === 'spam-trap' ? 'spam-trap' :
               response.data.status === 'do_not_mail' ? 'do-not-mail' :
               response.data.status === 'catch-all' ? 'catch-all' : 'unknown',
        score: response.data.score || 0,
        disposable: response.data.is_disposable || false,
        free: response.data.is_free_mail || false,
        role: response.data.is_role || false,
        verifiedAt: new Date(),
        source: 'zerobounce'
      };
    } catch {
      return null;
    }
  }
}

class NeverBounceValidator extends BaseValidator {
  name = 'NeverBounce';
  baseUrl = 'https://api.neverbounce.com/v4';
  apiKey = process.env.NEVERBOUNCE_API_KEY || '';
  
  async verify(email: string): Promise<ExternalValidationResult | null> {
    if (!this.apiKey) return null;
    
    try {
      const response = await axios.post(`${this.baseUrl}/single`, {
        email,
        api_key: this.apiKey
      });
      
      const result = response.data.result;
      return {
        email,
        result: result === 'valid' ? 'valid' :
               result === 'catchall' ? 'catch-all' :
               result === 'spamtrap' ? 'spam-trap' :
               result === 'do_not_mail' ? 'do-not-mail' : 'unknown',
        score: result === 'valid' ? 100 : result === 'catchall' ? 50 : 0,
        disposable: false,
        free: false,
        role: response.data.is_role || false,
        verifiedAt: new Date(),
        source: 'neverbounce'
      };
    } catch {
      return null;
    }
  }
}

class KickboxValidator extends BaseValidator {
  name = 'Kickbox';
  baseUrl = 'https://api.kickbox.com/v1';
  apiKey = process.env.KICKBOX_API_KEY || '';
  
  async verify(email: string): Promise<ExternalValidationResult | null> {
    if (!this.apiKey) return null;
    
    try {
      const response = await axios.get(this.baseUrl, {
        params: { email, apikey: this.apiKey }
      });
      
      return {
        email,
        result: response.data.result === 'deliverable' ? 'valid' :
               response.data.result === 'catch-all' ? 'catch-all' :
               response.data.result === 'undeliverable' ? 'invalid' : 'unknown',
        score: response.data.score || 0,
        disposable: response.data.disposable || false,
        free: false,
        role: response.data.role || false,
        verifiedAt: new Date(),
        source: 'kickbox'
      };
    } catch {
      return null;
    }
  }
}

const validators = [
  new ZeroBounceValidator(),
  new NeverBounceValidator(),
  new KickboxValidator()
];

export async function validateWithExternalAPI(email: string): Promise<ExternalValidationResult | null> {
  for (const validator of validators) {
    const result = await validator.verify(email);
    if (result) return result;
  }
  return null;
}

export async function validateEmailFull(email: string): Promise<ExternalValidationResult & { internal: boolean }> {
  const result = await validateEmail(email);
  
  let externalResult: ExternalValidationResult | null = null;
  
  if (result.valid) {
    externalResult = await validateWithExternalAPI(email);
  }
  
  if (externalResult) {
    return {
      ...externalResult,
      internal: false
    };
  }
  
  return {
    email,
    result: result.validity as any,
    score: result.valid ? 90 : 50,
    disposable: result.checks.disposable,
    free: false,
    role: result.checks.role,
    verifiedAt: result.verifiedAt,
    source: 'internal',
    internal: true
  };
}

export { validators };
