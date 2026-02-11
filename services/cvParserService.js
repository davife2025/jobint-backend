const OpenAI = require('openai');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class CVParserService {
  /**
   * Extract text from PDF file
   */
  async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      logger.error('PDF extraction error:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  /**
   * Extract text from DOCX file
   */
  async extractTextFromDOCX(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      logger.error('DOCX extraction error:', error);
      throw new Error('Failed to extract text from DOCX');
    }
  }

  /**
   * Extract text from CV based on file type
   */
  async extractTextFromCV(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.pdf':
        return await this.extractTextFromPDF(filePath);
      case '.docx':
        return await this.extractTextFromDOCX(filePath);
      case '.doc':
        return await this.extractTextFromDOCX(filePath);
      default:
        throw new Error('Unsupported file format');
    }
  }

  /**
   * Parse CV text using OpenAI to extract structured data
   */
  async parseCV(cvText) {
    try {
      const prompt = `
You are a professional resume parser. Extract the following information from this resume and return it as a valid JSON object.

Resume text:
${cvText}

Extract and return a JSON object with this exact structure (use null for missing fields):
{
  "skills": ["skill1", "skill2", "skill3"],
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "duration": "Jan 2020 - Present",
      "description": "Brief description"
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "University Name",
      "year": "2020"
    }
  ],
  "certifications": ["Certification 1", "Certification 2"],
  "summary": "Brief professional summary (2-3 sentences)"
}

Important: Return ONLY valid JSON, no explanations or markdown formatting.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a professional resume parser. Extract structured data from resumes and return only valid JSON.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const content = response.choices[0].message.content.trim();
      
      // Remove markdown code blocks if present
      const jsonContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsedData = JSON.parse(jsonContent);

      return {
        skills: parsedData.skills || [],
        experience: parsedData.experience || [],
        education: parsedData.education || [],
        certifications: parsedData.certifications || [],
        summary: parsedData.summary || null
      };
    } catch (error) {
      logger.error('CV parsing error:', error);
      
      // Return default structure if parsing fails
      return {
        skills: [],
        experience: [],
        education: [],
        certifications: [],
        summary: null,
        parseError: true
      };
    }
  }

  /**
   * Complete CV processing pipeline
   */
  async processCV(filePath) {
    try {
      logger.info(`Processing CV: ${filePath}`);

      // Extract text from file
      const cvText = await this.extractTextFromCV(filePath);

      if (!cvText || cvText.trim().length < 50) {
        throw new Error('CV appears to be empty or too short');
      }

      // Parse CV using AI
      const parsedData = await this.parseCV(cvText);

      logger.info('CV processed successfully');

      return {
        cvText,
        parsedData,
        success: true
      };
    } catch (error) {
      logger.error('CV processing error:', error);
      return {
        cvText: null,
        parsedData: null,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract job preferences from form data and CV
   */
  inferJobPreferences(parsedCV, formData) {
    const preferences = {
      desiredJobTitles: formData.jobTitles || [],
      desiredLocations: formData.location ? [formData.location] : [],
      remotePreference: formData.remotePreference || 'any',
      salaryMin: null,
      salaryMax: null,
      desiredIndustries: []
    };

    // Infer job titles from experience if not provided
    if (preferences.desiredJobTitles.length === 0 && parsedCV.experience?.length > 0) {
      // Use most recent job title
      preferences.desiredJobTitles.push(parsedCV.experience[0].role);
    }

    return preferences;
  }
}

module.exports = new CVParserService();