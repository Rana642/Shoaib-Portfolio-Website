/*
 * Regenerates the downloadable full CV at public/documents/shoaib-nabi-noor-resume.pdf.
 * Run with: npm run generate:resume-pdf
 *
 * This is the ONE place Akhuwat Foundation is allowed to appear — per
 * Shoaib's rule, adsbyshoaib.com itself is a "Personal Branding context"
 * that excludes it (see lib/experience.ts and the accountant-story-
 * resume-only memory), but a full CV/PDF document is the "CV/Resume
 * context" where his complete history belongs. Personal Information
 * (CNIC, father's name, marital status) from his source data is still
 * excluded here too — unnecessary exposure for a document that gets
 * emailed/uploaded to job boards. Ask him explicitly before adding it.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Link, renderToFile } from "@react-pdf/renderer";

const INK = "#0F0F14";
const INK_MUTED = "#4A4A52";
const INK_SUBTLE = "#7A7A82";
const CITRUS = "#B8860B"; // darker than web citrus (#EAB308) — legible as text/lines on white paper
const COBALT = "#1E40AF";
const LINE = "#E4E4E7";

const styles = StyleSheet.create({
  page: { padding: "36pt 40pt", fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },

  // Header
  headerBlock: { flexDirection: "column" },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  title: { fontSize: 11, color: COBALT, marginTop: 5, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  contactRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 4 },
  contactItem: { fontSize: 8.5, color: INK_MUTED, marginRight: 12 },
  accentLine: { height: 2, backgroundColor: CITRUS, marginTop: 10, marginBottom: 14, width: "100%" },

  // Sections
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: INK,
    borderBottomWidth: 1.5,
    borderBottomColor: CITRUS,
    paddingBottom: 3,
    marginBottom: 8,
  },
  section: { marginBottom: 14 },
  summaryText: { fontSize: 9.5, color: INK_MUTED, lineHeight: 1.5 },

  // Metrics
  metricsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, marginBottom: 4 },
  metricBox: { width: "33.33%", marginBottom: 8 },
  metricValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COBALT },
  metricLabel: { fontSize: 7.5, color: INK_SUBTLE, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 1 },

  // Experience entries
  entry: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: LINE },
  entryHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  role: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  company: { fontSize: 9, color: COBALT, fontFamily: "Helvetica-Bold", marginTop: 1 },
  stintsCol: { alignItems: "flex-end" },
  stint: { fontSize: 7.5, color: INK_SUBTLE, textAlign: "right" },
  overview: { fontSize: 8.5, color: INK_MUTED, marginTop: 4, lineHeight: 1.4 },
  subLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: INK, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 5, marginBottom: 2 },
  bulletRow: { flexDirection: "row", marginTop: 2 },
  bulletDot: { width: 8, fontSize: 8.5, color: CITRUS },
  bulletText: { flex: 1, fontSize: 8.5, color: INK_MUTED, lineHeight: 1.35 },
  inlineList: { fontSize: 8.5, color: INK_MUTED, marginTop: 2, lineHeight: 1.4 },
  note: { fontSize: 8, color: INK_SUBTLE, fontStyle: "italic", marginTop: 4 },

  // Skills
  skillGroup: { marginBottom: 6 },
  skillCategory: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: COBALT, marginBottom: 1.5 },
  skillItems: { fontSize: 8.2, color: INK_MUTED, lineHeight: 1.4 },

  // Two-column layout
  twoCol: { flexDirection: "row", gap: 20 },
  col: { flex: 1 },

  // Education
  eduEntry: { marginBottom: 8 },
  eduDegree: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  eduInst: { fontSize: 8.5, color: COBALT, marginTop: 1 },
  eduPeriod: { fontSize: 7.5, color: INK_SUBTLE, marginTop: 1 },

  langRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5, paddingBottom: 5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  langName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  langLevel: { fontSize: 8, color: INK_SUBTLE },

  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7.5, color: INK_SUBTLE, textAlign: "center", borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
  pageNum: { position: "absolute", bottom: 24, right: 40, fontSize: 7.5, color: INK_SUBTLE },
});

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>—</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ---- Data ----

const summary =
  "Performance marketing specialist with 6+ years of experience and $2.5M+ in managed advertising spend across Meta, Google, YouTube, and TikTok. Full-stack digital marketing capability spanning campaign strategy, media buying, conversion tracking, website and funnel development, and lead generation. Industry experience spans real estate, hospitality, salons, e-commerce, legal services, education, and B2B animal-health pharmaceuticals — with clients across Pakistan and internationally (France, Sweden).";

const metrics = [
  { value: "6+", label: "Years in digital marketing" },
  { value: "$2.5M+", label: "Managed ad spend" },
  { value: "4", label: "Ad platforms mastered" },
  { value: "8+", label: "Industries served" },
  { value: "15+", label: "Brands worked with" },
  { value: "PK · FR · SE", label: "International reach" },
];

type Job = {
  role: string;
  company: string;
  location?: string;
  stints: string[];
  overview?: string;
  managedLabel?: string;
  managed?: string[];
  contributions: string[];
  note?: string;
};

// Reverse-chronological. Akhuwat Foundation included — full CV/PDF context only,
// per Shoaib's explicit rule (excluded from the adsbyshoaib.com website itself).
const workExperience: Job[] = [
  {
    role: "Digital Media Marketer",
    company: "Avenza Group of Companies",
    location: "Multan",
    stints: ["Jul 2025 — Present", "Jan 2024 — Mar 2024 (3 months)", "Apr 2021 — Sep 2023"],
    overview:
      "Multi-brand group operating hospitality, salon, education, real estate, and event businesses across Multan — each brand runs its own independent social presence.",
    managedLabel: "Brands managed",
    managed: [
      "Toni&Guy Multan", "Choppers Salon", "Hotel Avalon Suites",
      "Hotel Elegant Executive Suite Multan", "Eventia 360", "Pines Institute",
      "AvenzaLand.com", "Avenza Avenue",
    ],
    contributions: [
      "Full social media management across all brand handles — posting and content strategy",
      "Meta Ads: awareness campaigns for salons; WhatsApp booking + awareness/engagement for hotels with no websites of their own",
      "Google Business Profile creation and optimization for every brand",
      "Meta Business Suite setup and blue tick verification for Avenza Avenue",
      "Recruitment ad campaigns on Facebook for corporate hiring on the parent group page",
      "Collaborated with an in-house graphics/video/photography team — owned strategy, posting, and ads",
    ],
  },
  {
    role: "Social Media Coordinator & Performance Marketer",
    company: "Al Mannan Builders",
    location: "DHA Multan",
    stints: ["Apr 2024 — Jun 2025", "Oct 2023 — Dec 2023", "Remote, 3 months during Avenza stint (Meta lead ads only)"],
    overview:
      "Real estate construction and development company in DHA Multan, selling three home categories under one unified brand platform.",
    managedLabel: "Product categories",
    managed: ["Lavista Smart Homes", "Spanish Modern Villas", "Aura Classic Home"],
    contributions: [
      "Full social media management and caption/content writing",
      "Meta Ads across awareness, engagement, and lead generation",
      "Instant Forms setup for lead capture on homes and construction services",
      "Google Business Profile management and optimization",
      "Kept brand messaging consistent across three product lines on one platform",
    ],
    note: "Scope covered DHA Multan homes and construction services only — not Al Mannan's Ali Pur City housing societies.",
  },
  {
    role: "Digital Media Marketer",
    company: "Choice Shoes",
    location: "Multan",
    stints: ["Jan 2019 — Mar 2021 (2 years 3 months)"],
    overview:
      "E-commerce women's footwear brand (choiceshoes.pk) — first formal digital marketing role after switching careers from accounting, and first hands-on Meta Ads experience.",
    contributions: [
      "Social media strategy and daily content management",
      "First Meta Ads campaigns — modest results, but foundational",
      "Inbox and customer inquiry handling",
      "Google Business Profile management",
      "Website product listings and order management",
    ],
  },
  {
    role: "Area Accountant",
    company: "Akhuwat Foundation Pakistan",
    location: "Multan",
    stints: ["Mar 2013 — Aug 2016 (3 years 5 months)"],
    overview: "First professional role, prior to switching into digital marketing. Non-profit microfinance organization.",
    contributions: [
      "Daily payment processing and deposit reporting",
      "Voucher preparation and reconciliation",
      "Payroll processing",
      "Monthly expense summaries and financial reporting",
    ],
  },
];

type Project = {
  company: string;
  role: string;
  period?: string;
  overview?: string;
  services: string[];
  note?: string;
};

const remoteProjects: Project[] = [
  {
    company: "Meezab Z. International (meezabz.com)",
    role: "Digital Marketing Consultant — Remote",
    overview:
      "Multan-based (founded 2014) importer/distributor of WHO-GMP & HACCP-GMP certified poultry animal-health products — exclusive Pakistan distributor for REEFCO (Jordan) and Lexington Enterprises (Singapore), covering 100+ areas across Punjab, Sindh, and Balochistan.",
    services: [
      "Built the full multi-page website (Home, About, Solutions, Products, Distributors, Contact)",
      "WhatsApp Business integration; social handles on Facebook, Instagram, LinkedIn",
      "Google Business Profile optimization; brand positioning around WHO-GMP + HACCP certifications",
    ],
    note: "No ad campaigns run — focus was digital presence and B2B credibility.",
  },
  {
    company: "TAD Pharma (tadpharma.pk)",
    role: "Digital Marketing Consultant — Remote",
    overview:
      "Multan-based importer & sole distributor of GMP/HACCP/ISO 9001:2015 certified animal health products, covering 58 cities across Pakistan.",
    services: ["Built a multi-page website with product catalog", "WhatsApp Business integration for distributor inquiries"],
    note: "No ad campaigns run.",
  },
  {
    company: "Hotel Elegant Executive Suite",
    role: "Full-Stack Digital Marketing — Remote, Ongoing",
    overview: "Originally an Avenza Group onsite project; continued as an independent remote client after the hotel was leased to a new owner.",
    services: ["Meta Business Suite setup & social media management", "Meta Ads, Google Ads", "Custom booking website with integrated reservation system"],
  },
  {
    company: "Hotel Silver Sand",
    role: "Full-Stack Digital Marketing — Remote, Ongoing",
    overview: "Multan-based hotel offering air-conditioned rooms and free WiFi.",
    services: ["Meta Business Suite setup & social media management", "Meta Ads, Google Ads", "Custom website with integrated booking system"],
  },
  {
    company: "Multan Law Firm",
    role: "Digital Marketing Specialist — Remote",
    period: "Aug 2023 — Present",
    services: ["Social media set up from zero, with ongoing posting", "Meta Ads for lead generation", "Google Business Profile management"],
  },
  {
    company: "International Clients",
    role: "Light-Touch Digital Marketing — Remote",
    services: [
      "Come Live In France (comeliveinfrance.com) — immigration & relocation services, 3,000+ expats served across 50+ countries. Page setup and ad management.",
      "Trönninge Pizza & Indisk Mat (tronningepizza.se) — Italian-Indian fusion restaurant, Halmstad, Sweden. Page setup and ad management.",
    ],
  },
];

const technicalSkillGroups = [
  { category: "Paid Advertising & Media Buying", items: "Meta Ads (Facebook & Instagram), Google Ads (Search, Display, PMax, Shopping), YouTube Ads, TikTok Ads, full-funnel architecture, A/B testing, bid & budget management, audience research, retargeting & lookalikes, WhatsApp booking ads" },
  { category: "Analytics & Tracking", items: "GA4, Google Tag Manager, Google Search Console, Meta Pixel + Conversion API (server-side), Google Ads Enhanced Conversions, TikTok Pixel, cross-platform attribution, Looker Studio reporting" },
  { category: "Web Development & Funnels", items: "Next.js, website development & deployment, landing pages, booking systems, e-commerce ops, funnel strategy, email marketing sequences, CRO, payment gateways (Stripe, PayPal, JazzCash, HBL), Supabase, WhatsApp Cloud API" },
  { category: "Presence & Brand Setup", items: "Meta Business Manager & Suite, blue-tick verification, social handle setup, Google Business Profile, content strategy, copywriting, brand positioning, local SEO" },
  { category: "SEO & Content", items: "On-page & technical SEO, local SEO, AI Search Optimization (AEO), content strategy, blog development, schema markup" },
  { category: "Tools & Platforms", items: "Meta Business Manager, Google Ads Manager (MCC), GA4, GTM, Search Console, TikTok Ads Manager, YouTube Studio, Sanity CMS, Channex, Zoho, HubSpot, Vercel, Supabase, Resend, Make.com" },
  { category: "Data & Reporting", items: "Advanced MS Excel, data analysis, performance dashboards, ROI/ROAS calculation, CPA optimization" },
];

const softSkillGroups = [
  { category: "Communication", items: "Client relationship management, cross-functional collaboration, clear technical communication, written proposals & reports, presentation & pitching" },
  { category: "Leadership & Management", items: "Independent project ownership, vendor/collaborator management, team coordination, client onboarding, strategic decision-making" },
  { category: "Analytical & Problem-Solving", items: "Data-driven decisions, root cause analysis, campaign troubleshooting, attribution analysis, budget allocation" },
  { category: "Business Acumen", items: "Accounting-grounded business fundamentals, ROI-focused mindset, multi-industry adaptability, financial literacy" },
  { category: "Personal Attributes", items: "Self-motivated, detail-oriented, deadline-driven, continuous learner, ethical & transparent, solution-oriented, cross-cultural client experience (PK, France, Sweden)" },
];

const languages = [
  { name: "English", level: "Professional working proficiency" },
  { name: "Urdu", level: "Native" },
  { name: "Punjabi", level: "Native" },
  { name: "Chinese (Mandarin)", level: "Basic" },
];

const education = [
  { degree: "Bachelor of Commerce (B.Com)", inst: "Bahauddin Zakariya University, Multan", period: "Completed 2012 · 2nd Division" },
  { degree: "Higher Secondary School Certificate (HSSC)", inst: "BISE Multan", period: "Completed 2008 · 2nd Division" },
  { degree: "Secondary School Certificate (SSC)", inst: "BISE Multan", period: "Completed 2006 · 2nd Division" },
];

// ---- Document ----

function ResumeDocument() {
  return (
    <Document title="Shoaib Nabi Noor — Resume" author="Shoaib Nabi Noor">
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.headerBlock}>
          <Text style={styles.name}>Shoaib Nabi Noor</Text>
          <Text style={styles.title}>Performance Marketing Specialist · Media Buyer</Text>
        </View>
        <View style={styles.contactRow}>
          <Text style={styles.contactItem}>Multan, Punjab, Pakistan</Text>
          <Text style={styles.contactItem}>+92 301 7461642</Text>
          <Text style={styles.contactItem}>shoaib.nabi.noor@gmail.com</Text>
          <Link src="https://linkedin.com/in/shoaibnabinoor" style={styles.contactItem}>linkedin.com/in/shoaibnabinoor</Link>
          <Link src="https://adsbyshoaib.com" style={styles.contactItem}>adsbyshoaib.com</Link>
        </View>
        <View style={styles.accentLine} />

        {/* Summary */}
        <View style={styles.section}>
          <SectionTitle>Professional Summary</SectionTitle>
          <Text style={styles.summaryText}>{summary}</Text>
          <View style={styles.metricsRow}>
            {metrics.map((m) => (
              <View key={m.label} style={styles.metricBox}>
                <Text style={styles.metricValue}>{m.value}</Text>
                <Text style={styles.metricLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Work Experience */}
        <View style={styles.section}>
          <SectionTitle>Work Experience</SectionTitle>
          {workExperience.map((job) => (
            <View key={job.company} style={styles.entry} wrap={false}>
              <View style={styles.entryHeaderRow}>
                <View>
                  <Text style={styles.role}>{job.role}</Text>
                  <Text style={styles.company}>{job.company}{job.location ? ` · ${job.location}` : ""}</Text>
                </View>
                <View style={styles.stintsCol}>
                  {job.stints.map((s) => (
                    <Text key={s} style={styles.stint}>{s}</Text>
                  ))}
                </View>
              </View>
              {job.overview && <Text style={styles.overview}>{job.overview}</Text>}
              {job.managed && (
                <>
                  <Text style={styles.subLabel}>{job.managedLabel}</Text>
                  <Text style={styles.inlineList}>{job.managed.join("  ·  ")}</Text>
                </>
              )}
              <Text style={styles.subLabel}>Key Contributions</Text>
              {job.contributions.map((c) => <Bullet key={c}>{c}</Bullet>)}
              {job.note && <Text style={styles.note}>{job.note}</Text>}
            </View>
          ))}
        </View>

        {/* Remote / Client Projects */}
        <View style={styles.section} break>
          <SectionTitle>Remote / Client Projects (Selected Engagements)</SectionTitle>
          {remoteProjects.map((p) => (
            <View key={p.company} style={styles.entry} wrap={false}>
              <View style={styles.entryHeaderRow}>
                <View>
                  <Text style={styles.role}>{p.company}</Text>
                  <Text style={styles.company}>{p.role}</Text>
                </View>
                {p.period && <Text style={styles.stint}>{p.period}</Text>}
              </View>
              {p.overview && <Text style={styles.overview}>{p.overview}</Text>}
              {p.services.map((s) => <Bullet key={s}>{s}</Bullet>)}
              {p.note && <Text style={styles.note}>{p.note}</Text>}
            </View>
          ))}
        </View>

        {/* Skills */}
        <View style={styles.section} break>
          <SectionTitle>Core Technical Skills</SectionTitle>
          {technicalSkillGroups.map((g) => (
            <View key={g.category} style={styles.skillGroup} wrap={false}>
              <Text style={styles.skillCategory}>{g.category}</Text>
              <Text style={styles.skillItems}>{g.items}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <SectionTitle>Soft Skills</SectionTitle>
          {softSkillGroups.map((g) => (
            <View key={g.category} style={styles.skillGroup} wrap={false}>
              <Text style={styles.skillCategory}>{g.category}</Text>
              <Text style={styles.skillItems}>{g.items}</Text>
            </View>
          ))}
        </View>

        {/* Languages + Education */}
        <View style={styles.twoCol} wrap={false}>
          <View style={styles.col}>
            <SectionTitle>Languages</SectionTitle>
            {languages.map((l) => (
              <View key={l.name} style={styles.langRow}>
                <Text style={styles.langName}>{l.name}</Text>
                <Text style={styles.langLevel}>{l.level}</Text>
              </View>
            ))}
          </View>
          <View style={styles.col}>
            <SectionTitle>Education</SectionTitle>
            {education.map((e) => (
              <View key={e.degree} style={styles.eduEntry}>
                <Text style={styles.eduDegree}>{e.degree}</Text>
                <Text style={styles.eduInst}>{e.inst}</Text>
                <Text style={styles.eduPeriod}>{e.period}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Certifications */}
        <View style={styles.section} wrap={false}>
          <SectionTitle>Certifications</SectionTitle>
          <Text style={styles.role}>Soft Skills Training Certificate</Text>
          <Text style={styles.overview}>
            Overseas Employment Corporation (OEC) & International Centre for Migration Policy
            Development (ICMPD) · 11 Days / 22 Hours · Completed October 15, 2025
          </Text>
          <Text style={styles.note}>
            Certificate No. 26cc3a76 — signed by Ms. Marija Raus (Head of Region Silk Routes, ICMPD)
            and Mr. Naseer Khan Kashani (Managing Director, OEC)
          </Text>
        </View>

        <Text style={styles.footer}>References available upon request. · adsbyshoaib.com</Text>
        <Text
          style={styles.pageNum}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

const outputPath = "public/documents/shoaib-nabi-noor-resume.pdf";

renderToFile(<ResumeDocument />, outputPath).then(() => {
  console.log(`PDF generated: ${outputPath}`);
});
