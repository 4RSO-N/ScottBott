# 🔒 Security Checklist for ScottBot

## ⚠️ IMMEDIATE SECURITY ACTIONS REQUIRED

### 1. Rotate API Keys (CRITICAL)
Since your API keys are visible in this codebase, you should **immediately** rotate them:

**Discord Bot Token:**
- Go to [Discord Developer Portal](https://discord.com/developers/applications)
- Select your application → Bot → Reset Token
- Update your `.env` file with the new token

**Gemini API Key:**
- Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
- Delete the current key: `[REDACTED_FOR_SECURITY]`
- Create a new API key
- Update your `.env` file with the new key

**Perplexity API Key:**
- Go to [Perplexity AI Settings](https://www.perplexity.ai/settings/api)
- Revoke the current key (if exposed): `[REDACTED_PERPLEXITY_KEY]`
- Generate a new API key
- Update your `.env` file with the new key

### 2. Environment Security ✅ DONE
- [x] `.env` is listed in `.gitignore`
- [x] `.env.example` template created
- [x] Security warnings added to `.env` file

### 3. Additional Security Measures

**File Permissions:**
```bash
# On Linux/Mac, restrict .env file permissions
chmod 600 .env

# On Windows (PowerShell as Admin)
icacls .env /inheritance:r /grant:r "%USERNAME%:F"
```

**Environment Variable Validation:**
- ✅ Bot validates all required environment variables on startup
- ✅ API keys are masked in logs and status outputs
- ✅ Error handling prevents key exposure in error messages

**Rate Limiting:**
- ✅ Built-in rate limiting (10 requests/minute per user)
- ✅ API usage tracking and monitoring
- ✅ Automatic failover between services

## 🛡️ Security Best Practices

### Production Deployment
1. **Use Environment Variables in Production:**
   - Set env vars directly on your hosting platform
   - Never upload `.env` files to production servers
   - Use secrets management (Azure Key Vault, AWS Secrets Manager, etc.)

2. **Monitor API Usage:**
   - Use `!stats` command to monitor request patterns
   - Set up alerts for unusual usage spikes
   - Review logs regularly in `logs/` directory

3. **Network Security:**
   - Use HTTPS for all API communications (already implemented)
   - Consider running the bot behind a reverse proxy
   - Implement IP whitelisting if needed

### Development Security
1. **Local Development:**
   - Never commit `.env` to version control
   - Use different API keys for development/production
   - Regularly rotate development keys

2. **Code Security:**
   - ✅ Input validation implemented
   - ✅ Error handling prevents information disclosure
   - ✅ No hardcoded secrets in source code

## 📋 Security Checklist

- [ ] **CRITICAL**: Rotate all API keys immediately
- [x] Environment file protected by `.gitignore`
- [x] API keys masked in logs and outputs
- [x] Input validation implemented
- [x] Rate limiting configured
- [x] Error handling implemented
- [ ] Set restrictive file permissions on `.env`
- [ ] Set up monitoring and alerting
- [ ] Plan for key rotation schedule (monthly recommended)

## 🚨 If Keys Are Compromised

1. **Immediately revoke** all compromised keys
2. **Generate new keys** with proper security
3. **Monitor usage** for any unauthorized access
4. **Update** all environments with new keys
5. **Review logs** for suspicious activity

## 📞 Security Resources

- [Discord Bot Security](https://discord.com/developers/docs/topics/oauth2#bot-vs-user-accounts)
- [Google API Security](https://cloud.google.com/docs/security/security-best-practices)
- [Node.js Security Best Practices](https://nodejs.org/en/security/)

---
**Remember: Security is an ongoing process, not a one-time setup!**