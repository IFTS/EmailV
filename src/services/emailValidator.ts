import { promises as dns } from 'dns';
import { createConnection } from 'net';
import { randomBytes } from 'crypto';

export interface ValidationResult {
  email: string;
  valid: boolean;
  validity: 'valid' | 'invalid' | 'risky' | 'unknown';
  checks: {
    format: boolean;
    mx: boolean;
    smtp: boolean;
    disposable: boolean;
    role: boolean;
    catchAll: boolean;
  };
  reason?: string;
  smtpCode?: string;
  verifiedAt?: Date;
}

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'yopmail.com', 'getnada.com', 'sharklasers.com',
  'mintemail.com', 'maildrop.cc', 'mohmal.com', 'tempail.com',
  'spam4.me', 'fakeinbox.com', 'trashmail.com', 'dispostable.com',
  'airmail.net', 'anonymousemail.com', 'boximail.com', 'buddy.com',
  'crazymailing.com', 'deadformat.com', 'despam.it', 'dodgeit.com',
  'dodgit.com', 'dropmail.me', 'eyepaste.com', 'fastacura.com',
  'filzmail.com', 'flashmail.com', 'flyspam.com', 'freemail.ms',
  'ghosttexter.de', 'girlsunder18.com', 'gishpuppy.com', 'grandmamail.com',
  'greensloth.com', 'gsrv.co.uk', 'hotpop.com', 'ihateyoualot.info',
  'imails.nl', 'inboxalias.com', 'jetable.org', 'kasmail.com',
  'klassmaster.com', 'klzlvaxz.com', 'koszmail.com', 'kulturbetrieb.info',
  'kurzepost.de', 'lifetimefake.com', 'lol.xt.pl', 'lospam.net',
  'mailin8r.com', 'mailinator.com', 'mailinater.com', 'mailme.nl',
  'mailmoat.com', 'mailnull.com', 'mailzilla.com', 'mbx.in',
  'meltmail.com', 'messagebeaver.com', 'mintemail.com', 'missgg.com',
  'mobiflash.com', 'mt2009.com', 'mt2014.com', 'mycleaninbox.net',
  'mymailo.net', 'mytemp.email', 'nabori.com', 'nahu.ru',
  'nano.soap.in', 'neonets.com', 'nervm.net', 'nervtm.net',
  'netmails.com', 'netmails.net', 'neue-email.com', 'ninja.kiwi',
  'no-spam.ws', 'nobulk.com', 'noclick.in', 'nogspam.com',
  'nomail.xl.cx', 'nomail2me.com', 'nomorespam.in', 'nonspam.eu',
  'nulmailer.com', 'o2.pl', 'oalsw.ru', 'ob如意.com',
  'odnorogov.ru', 'ohioads.com', 'ohiotel.com', 'oktw.pl',
  'opticschip.no', 'ordinarymail.com', 'otherinbox.com', 'outlawspam.de',
  'pcpost.xyz', 'pdr.co.za', 'pepipost.com', 'piffle.com',
  'poff.com', 'pohouse.com', 'popa.lu', 'popmail.com',
  'postfix.org', 'privacy.net', 'proxymail.net', 'punkass.de',
  'putthisinyourspam.com', 'qmeyers.com', 'quickinbox.com', 'qipeople.net',
  'qisq.net', 'quququ.com', 'raceless.com', 'raovet.net',
  'rarame.com', 'realtyalerts.com', 'remedy.rip', 'rhyta.com',
  'rmqkr.net', 'royal.net', 'rppkn.com', 'rtnweb.com',
  'ru.ru', 's-bd.de', 's-ml.ru', 'saeq.net',
  'safe-mail.net', 'safetymail.info', 'safetypost.de', 'sakf.com',
  'salmonmail.com', 'samsspam.com', 'saucent.com', 'scatmail.com',
  'secret-email.de', 'securemail.com', 'secure-server.ws', 'selfdestruct.com',
  'sendspam.de', 'sharklasers.com', 'short-mail.net', 'shtep.com',
  'sili.com', 'skeefam.com', 'sky-ts.de', 'slaskpost.se',
  'slave.at', 'sloanspider.com', 'smap4.net', 'smapley.net',
  'smmail.de', 'snap.net', 'sneakemail.com', 'sofimail.com',
  'softwaresarik.com', 'sofort-mail.de', 'sogetthis.com', 'sonnenkinder.net',
  'spam-offensive.com', 'spam.la', 'spambox.us', 'spamcage.com',
  'spamcowboy.com', 'spamcowboy.net', 'spamday.com', 'spamde.io',
  'spamdeck.net', 'spamdivert.nl', 'spamex.com', 'spamfighter.com',
  'spamfocus.com', 'spamgourmet.com', 'spamgremlins.com', 'spamhelp.org',
  'spamherelots.com', 'spamify.com', 'spaminator.de', 'spaminator.org',
  'spamkill.us', 'spamking.com', 'spamkitty.com', 'spaml.com',
  'spaml.de', 'spamlist.com', 'spaml.org', 'spammail.com',
  'spammailer.com', 'spammotel.com', 'spamplemaise.com', 'spampoo.com',
  'spamposl.com', 'spamprevention.com', 'spampro.com', 'spamsalad.com',
  'spamsandwitch.com', 'spamsecure.com', 'spamslayer.com', 'spamstop.com',
  'spamstop.ir', 'spamstrong.com', 'spamsuche.de', 'spamsuck.com',
  'spamterm.com', 'spamthai.com', 'spamthis.com', 'spamtrap.com',
  'spamtrap.co', 'spamtroll.net', 'spamwell.com', 'spamwire.com',
  'spamworks.org', 'spamz.de', 'speedga.com', 'squeakmail.com',
  'stackemail.net', 'startfil.com', 'statsdating.com', 'stexsy.com',
  'stolencontent.com', 'stopspam.com', 'suck.net', 'suery.org',
  'sundiustore.com', 'supergreatmail.com', 'supermailer.com', 'superrito.com',
  'superstachel.de', 'surveyby.net', 'susiweb.net', 'tafmail.com',
  'tagteam.moe', 'talk-act.net', 'teewars.org', 'telega.org',
  'tempail.com', 'tempeal.com', 'tempemail.org', 'tempinbox.com',
  'tempirate.com', 'templemail.com', 'temporaryaddress.net', 'temporaryemail.net',
  'temporaryinbox.com', 'temppmail.com', 'temppmail.org', 'tempr.email',
  'temptation.rip', 'test.com', 'thanks.ninja', 'thejellydonut.com',
  'theonemail.com', 'thelast.com', 'thisisnotmyemail.com', ' throw.email',
  'throtteleg.com', 'throwaway-email.com', 'throwawaymail.com', 'throwemail.org',
  'throwmail.info', 'throwr.com', 'tinomail.com', 'tinylask.com',
  'titonite.com', 'tjiis.com', 'tmpmail.com', 'tmpmail.net',
  'tmpmail.org', 'tmpmailo.com', 'tmppost.com', 'tmppost.net',
  'today.com', 'toddsdad.com', 'toddfather.com', 'tokenfeed.com',
  'tonn-torn.ru', 'tonorn.ru', 'topdeck.com', 'tormail.org',
  'tornado.rip', 'townisp.com', 'toxicfox.com', 'toypot.com',
  'traceable.com', 'trash200.com', 'trash4.me', 'trasharound.com',
  'trashbox.us', 'trashby.me', 'trashdevil.com', 'trashemail.com',
  'trashemails.com', 'trashin.com', 'trashmail.com', 'trashmail.net',
  'trashmail.org', 'trashme.de', 'trashme.us', 'trashmemail.com',
  'trashmi.com', 'trashymail.com', 'trayna.com', 'tripfork.de',
  'trustpilot.com', 'tryalert.com', 'tryinbox.com', 'tts-data.com',
  'turbopost.com', 'tvinx.net', 'twoweird.com', 'tyNetwork.com',
  'uafun.com', 'uckus.com', 'uemail.org', 'ultraemail.net',
  'ultramail.com', 'unlimitedmail.net', 'unspam.com', 'uol.com.br',
  'uploaded.to', 'upsmail.com', 'urbangirl.net', 'us.to',
  'valem.com', 'vankka.com', 'vegidiot.com', 'veijle.com',
  'verifymail.de', 'verifymyemail.com', 'veryrealemail.com',
  'vinag.com', 'vipmr.com', 'viralplays.com', 'vmail.me',
  'vmaniatis.com', 'volatilemails.com', 'vomoto.com', 'vpn.st',
  'vsimcard.com', 'vubla.com', 'walala.org', 'walkmail.com',
  'walkmen.com', 'wam-me.net', 'wamail.net', 'warmonline.com',
  'warpmail.ca', 'warthawg.com', 'wasteland.com', 'watchcat.com',
  'watchdog.net', 'waum.com', 'wcota.com', 'webcontact.net',
  'webm4il.com', 'webmail.codes', 'webmail.io', 'webmail.there.net',
  'webmessa.com', 'weird.com', 'well.cash', 'wewonttell.com',
  'wh4f.org', 'whatiaf.com', 'whatmail.net', 'when.com',
  'whiffy.net', 'whitecubic.com', 'whitemail.com', 'whoever.com',
  'whtj.com', 'willhackforfood.biz', 'willselfdestruct.com', 'winemaven.org',
  'wineonline.com', 'wins proceed.com', 'wmail.org', 'wolfsmail.com',
  'wollan.info', 'wombagmail.com', 'women-mail.net', 'woohoo.com',
  'wookie.cf', 'wool.overload.pk', 'worldemail.com', 'worldmail.me',
  'write.to', 'wronghead.com', 'www.com', 'wwwform.ru',
  'x1.to', 'x2.to', 'x3.to', 'x4.to', 'x5.to',
  'x6.to', 'x7.to', 'x8.to', 'x9.to', 'xa.gl',
  'xbxbxb.com', 'xemail.me', 'xmailer.net', 'xmaily.com',
  'xoxo.host', 'xpert.cf', 'xpert.com', 'xpsa.cc', 'xrho.com',
  'xroom.net', 'xsonara.com', 'xsubj.com', 'xvz.la',
  'y7mail.com', 'yadav.com', 'yahoo.com', 'yandex.com',
  'yeah.net', 'yemail.com', 'yepda.com', 'yermail.com',
  'yogam.email', 'yogumes.com', 'yopmail.com', 'yopmail.fr',
  'yopmail.net', 'young.law', 'yourdomain.com', 'yourinbox.ltd',
  'yourmail.net', 'yoxun.com', 'yuuroh.com', 'yxz.jp',
  'z1p.com', 'zabor.org', 'zaka.com', 'zamil.com',
  'zapnag.com', 'zappost.net', 'zas.info', 'zbw.cc',
  'ze.gs', 'zejbr.com', 'zemail.info', 'zenasnet.work',
  'zerou.com', 'zest.in', 'zfb.jp', 'zhabor.info',
  'zip.bz', 'zipcat.org', 'zipzip.net', 'zlata.net',
  'zmail.info', 'zmailproject.com', 'zmrae.com', 'zoininc.com',
  'zomail.info', 'zomg.com', 'zong.bg', 'zp.id', 'zub.inf',
  'zvezda.org', 'zxcv.com', 'zxcvbn.com', 'zyre.com'
]);

const ROLE_ACCOUNTS = new Set([
  'info', 'admin', 'support', 'help', 'noreply', 'sales', 'contact',
  'webmaster', 'hostmaster', 'postmaster', 'abuse', 'security', 'billing',
  'team', 'staff', 'office', 'finance', 'accounting', 'hr', 'jobs',
  'enquiries', 'inquiries', 'marketing', 'advertising', 'press', 'media',
  'partners', 'vendor', 'suppliers', 'purchase', 'procurement', 'orders',
  'customerservice', 'cs', 'feedback', 'survey', 'research', 'development',
  'dev', 'tech', 'engineering', 'recruitment', 'careers', 'investor',
  'investors', 'legal', 'compliance', 'privacy', 'dpo', 'ceo', 'cto',
  'cfo', 'coo', 'director', 'executive', 'manager'
]);

const RFC5322_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/;

const TIMEOUT_MS = 4000;

export async function validateEmail(email: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    email,
    valid: false,
    validity: 'invalid',
    checks: {
      format: false,
      mx: false,
      smtp: false,
      disposable: false,
      role: false,
      catchAll: false
    }
  };

  if (!email || typeof email !== 'string') {
    result.reason = 'Invalid email format';
    return result;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!RFC5322_REGEX.test(normalizedEmail)) {
    result.reason = 'RFC 5322 format violation';
    return result;
  }

  result.checks.format = true;
  const [localPart, domain] = normalizedEmail.split('@');

  if (DISPOSABLE_DOMAINS.has(domain)) {
    result.checks.disposable = true;
    result.validity = 'risky';
    result.reason = 'Disposable email domain detected';
    return result;
  }

  if (ROLE_ACCOUNTS.has(localPart.toLowerCase())) {
    result.checks.role = true;
    result.validity = 'risky';
    result.reason = 'Role-based email account';
    return result;
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    
    if (!mxRecords || mxRecords.length === 0) {
      result.reason = 'No MX records found for domain';
      return result;
    }

    const sortedMx = mxRecords.sort((a, b) => a.priority - b.priority);
    result.checks.mx = true;

    const mxHosts = sortedMx.map(mx => mx.exchange);
    const { isAccepting, code, isCatchAll } = await checkSmtpWithCatchAll(mxHosts, normalizedEmail);
    
    result.checks.smtp = isAccepting;
    result.checks.catchAll = isCatchAll;
    
    if (code) {
      result.smtpCode = code;
    }

    if (result.checks.smtp) {
      if (result.checks.catchAll) {
        result.validity = 'unknown';
        result.reason = 'Domain accepts all emails (catch-all)';
      } else {
        result.valid = true;
        result.validity = 'valid';
      }
    } else if (result.checks.mx) {
      result.validity = 'unknown';
      result.reason = 'MX exists but SMTP connection rejected';
    }

    result.verifiedAt = new Date();

  } catch (err: any) {
    result.reason = 'DNS MX lookup failed';
  }

  return result;
}

async function checkSmtpWithCatchAll(mxHosts: string[], email: string): Promise<{ isAccepting: boolean; code?: string; isCatchAll: boolean }> {
  for (const mxHost of mxHosts) {
    try {
      const result = await performSmtpCheck(mxHost, email);
      if (result.code) return result;
    } catch {
      continue;
    }
  }
  return { isAccepting: false, isCatchAll: false };
}

function performSmtpCheck(mxHost: string, email: string): Promise<{ isAccepting: boolean; code?: string; isCatchAll: boolean }> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: mxHost, port: 25, timeout: TIMEOUT_MS });
    const commands: string[] = [];
    let cmdIndex = 0;
    let response = '';
    const randomString = randomBytes(8).toString('hex');

    commands.push(`HELO ${randomString}\r\n`);
    commands.push(`MAIL FROM:<verify@${mxHost}>\r\n`);
    commands.push(`RCPT TO:<${email}>\r\n`);
    commands.push(`QUIT\r\n`);

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.on('connect', () => {
      socket.write(commands[cmdIndex]);
    });

    socket.on('data', (data) => {
      response += data.toString();
      
      if (response.startsWith('220')) {
        cmdIndex++;
        if (cmdIndex < commands.length && !commands[cmdIndex].startsWith('QUIT')) {
          socket.write(commands[cmdIndex]);
        }
      } else if (response.startsWith('250')) {
        cmdIndex++;
        if (cmdIndex < commands.length) {
          socket.write(commands[cmdIndex]);
        }
      } else if (response.startsWith('550') || response.startsWith('553')) {
        cleanup();
        const code = response.substring(0, 3);
        resolve({ isAccepting: false, code, isCatchAll: code === '550' && response.toLowerCase().includes('accept') });
      } else if (response.startsWith('221')) {
        cleanup();
        resolve({ isAccepting: true, isCatchAll: false });
      }
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ isAccepting: false, isCatchAll: false });
    });

    socket.on('error', () => {
      cleanup();
      resolve({ isAccepting: false, isCatchAll: false });
    });

    setTimeout(() => {
      cleanup();
      resolve({ isAccepting: false, isCatchAll: false });
    }, TIMEOUT_MS);
  });
}

export async function validateBatch(emails: string[]): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  
  for (const email of emails) {
    const result = await validateEmail(email);
    results.push(result);
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

export function isValidEmailFormat(email: string): boolean {
  return RFC5322_REGEX.test(email?.trim()?.toLowerCase() || '');
}

export function isDisposableDomain(email: string): boolean {
  const domain = email?.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

export function isRoleBasedEmail(email: string): boolean {
  const localPart = email?.split('@')[0]?.toLowerCase();
  return localPart ? ROLE_ACCOUNTS.has(localPart) : false;
}
