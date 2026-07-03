// Three polished, ready-to-edit ATS resume samples — one paired with each
// built-in template. Users can pick one and edit, or use it as the layout the
// AI mirrors when no personal sample is uploaded.

export const SAMPLE_RESUMES = {
  classic: {
    name: 'Alex Morgan',
    title: 'Senior Software Engineer',
    contact: {
      email: 'alex.morgan@email.com',
      phone: '+1 (555) 123-4567',
      location: 'Austin, TX',
      linkedin: 'linkedin.com/in/alexmorgan',
      github: 'github.com/alexmorgan',
    },
    summary:
      'Senior software engineer with 8+ years building scalable web platforms. Specializes in Node.js, React, and cloud infrastructure, with a track record of leading teams and shipping products used by millions.',
    skills: [
      { group: 'Languages', items: ['JavaScript', 'TypeScript', 'Python', 'Go', 'SQL'] },
      { group: 'Frameworks', items: ['React', 'Node.js', 'Express', 'Next.js'] },
      { group: 'Cloud & DevOps', items: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'] },
    ],
    experience: [
      {
        company: 'TechCorp Inc.',
        role: 'Senior Software Engineer',
        location: 'Austin, TX',
        start: 'Jan 2021',
        end: 'Present',
        bullets: [
          'Led migration of monolith to microservices, cutting deploy time by 70% and improving uptime to 99.98%.',
          'Designed a real-time analytics pipeline processing 5M+ events/day with sub-second latency.',
          'Mentored 4 engineers and established code-review standards adopted org-wide.',
        ],
      },
      {
        company: 'StartupXYZ',
        role: 'Software Engineer',
        location: 'Remote',
        start: 'Jun 2017',
        end: 'Dec 2020',
        bullets: [
          'Built customer-facing React dashboard used by 50k+ daily active users.',
          'Reduced API response times by 40% through query optimization and caching.',
        ],
      },
    ],
    education: [
      {
        school: 'University of Texas at Austin',
        degree: 'B.S. Computer Science',
        location: 'Austin, TX',
        start: '2013',
        end: '2017',
        details: '',
      },
    ],
    projects: [],
    certifications: ['AWS Certified Solutions Architect – Professional'],
    awards: [],
  },

  modern: {
    name: 'Jordan Lee',
    title: 'Product Designer',
    contact: {
      email: 'jordan.lee@email.com',
      phone: '+1 (555) 987-6543',
      location: 'San Francisco, CA',
      website: 'jordanlee.design',
      linkedin: 'linkedin.com/in/jordanlee',
    },
    summary:
      'Product designer with 6 years crafting intuitive digital experiences for B2B and consumer products. Bridges user research, interaction design, and front-end implementation.',
    skills: [
      { group: 'Design', items: ['Figma', 'Sketch', 'Prototyping', 'Design Systems', 'User Research'] },
      { group: 'Front-end', items: ['HTML', 'CSS', 'React', 'Framer'] },
    ],
    experience: [
      {
        company: 'DesignHub',
        role: 'Senior Product Designer',
        location: 'San Francisco, CA',
        start: 'Mar 2020',
        end: 'Present',
        bullets: [
          'Owned end-to-end design of a SaaS analytics suite, raising activation rate by 32%.',
          'Built and maintained a 120-component design system used across 5 product teams.',
        ],
      },
      {
        company: 'Creative Agency Co.',
        role: 'Product Designer',
        location: 'Oakland, CA',
        start: 'Jul 2018',
        end: 'Feb 2020',
        bullets: ['Designed mobile apps for 10+ clients spanning fintech, health, and retail.'],
      },
    ],
    education: [
      {
        school: 'California College of the Arts',
        degree: 'B.F.A. Interaction Design',
        location: 'San Francisco, CA',
        start: '2014',
        end: '2018',
        details: '',
      },
    ],
    projects: [
      {
        name: 'OpenKit',
        description: 'Open-source UI kit downloaded 8k+ times.',
        tech: ['Figma', 'React'],
        link: 'github.com/jordanlee/openkit',
      },
    ],
    certifications: [],
    awards: ['Awwwards Site of the Day (2022)'],
  },

  compact: {
    name: 'Sam Rivera',
    title: 'Engineering Manager',
    contact: {
      email: 'sam.rivera@email.com',
      phone: '+1 (555) 246-8101',
      location: 'Seattle, WA',
      linkedin: 'linkedin.com/in/samrivera',
    },
    summary:
      'Engineering leader with 12 years of experience, including 5 managing high-performing teams. Focused on delivery, reliability, and growing engineers.',
    skills: [
      { group: 'Leadership', items: ['Team Building', 'Agile/Scrum', 'Roadmapping', 'Hiring'] },
      { group: 'Technical', items: ['Java', 'Python', 'AWS', 'Distributed Systems', 'Observability'] },
    ],
    experience: [
      {
        company: 'CloudScale',
        role: 'Engineering Manager',
        location: 'Seattle, WA',
        start: 'Apr 2019',
        end: 'Present',
        bullets: [
          'Grew team from 5 to 18 engineers across 3 squads while maintaining 95% retention.',
          'Delivered a platform re-architecture that scaled the product to 10x traffic.',
          'Introduced SLO-based on-call, cutting Sev-1 incidents by 60%.',
        ],
      },
      {
        company: 'DataWorks',
        role: 'Tech Lead',
        location: 'Seattle, WA',
        start: 'Jan 2015',
        end: 'Mar 2019',
        bullets: ['Led 6-engineer team building a data ingestion platform handling 2B records/day.'],
      },
    ],
    education: [
      {
        school: 'University of Washington',
        degree: 'B.S. Computer Engineering',
        location: 'Seattle, WA',
        start: '2007',
        end: '2011',
        details: '',
      },
    ],
    projects: [],
    certifications: [],
    awards: [],
  },
};

export function getSample(templateId) {
  return SAMPLE_RESUMES[templateId] || SAMPLE_RESUMES.classic;
}
