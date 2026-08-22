"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MapPin } from "lucide-react";
import Reveal from "@/components/shared/Reveal";
import { cn } from "@/lib/utils";
import type { PrimaryRole, RemoteProject } from "@/lib/experience";

function ExpandToggle({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center size-9 rounded-full border border-ink/15 shrink-0 transition-all duration-300 group-hover:border-citrus group-hover:bg-citrus/20",
        open && "bg-citrus border-citrus rotate-45"
      )}
    >
      <Plus className="size-4" aria-hidden />
    </span>
  );
}

function PrimaryRoleCard({ role, index }: { role: PrimaryRole; index: number }) {
  const [open, setOpen] = useState(index === 0);

  return (
    <Reveal delay={index * 0.08} className="relative pl-10 md:pl-14">
      {/* Timeline line + dot */}
      <span
        aria-hidden
        className="absolute left-[7px] md:left-[11px] top-2 bottom-0 w-px bg-ink/10"
      />
      <span
        aria-hidden
        className="absolute left-0 md:left-1 top-1.5 size-4 rounded-full bg-citrus ring-4 ring-cloud"
      />

      <div className="pb-10">
        <button
          onClick={() => setOpen(!open)}
          className="group w-full flex items-start justify-between gap-6 text-left"
        >
          <div>
            <h3 className="text-body-lg font-semibold">{role.role}</h3>
            <p className="text-small text-cobalt font-medium mt-1">
              {role.company} · {role.location}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {role.stints.map((stint) => (
                <span
                  key={stint.period + (stint.note ?? "")}
                  className="font-mono uppercase text-tag tracking-widest text-ink-subtle border border-ink/10 rounded-full px-3 py-1.5"
                >
                  {stint.period}
                  {stint.note ? ` · ${stint.note}` : ""}
                </span>
              ))}
            </div>
          </div>
          <ExpandToggle open={open} />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-5 max-w-2xl">
                <p className="text-body text-ink-muted">{role.overview}</p>

                <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-6">
                  {role.managedLabel}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {role.managed.map((item) => (
                    <span
                      key={item}
                      className="text-small border border-ink/15 rounded-full px-3.5 py-1.5"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-6">
                  Key contributions
                </p>
                <ul className="mt-3 space-y-2.5">
                  {role.contributions.map((point) => (
                    <li key={point} className="flex gap-3 items-start text-body text-ink-muted">
                      <span className="size-1.5 rounded-full bg-citrus inline-block shrink-0 mt-2.5" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>

                {role.note && (
                  <p className="text-small text-ink-subtle mt-5 italic">{role.note}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  );
}

function RemoteProjectCard({ project, index }: { project: RemoteProject; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Reveal delay={(index % 3) * 0.07}>
      <div className="h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-6 transition-all duration-300 hover:shadow-lg hover:shadow-ink/5 hover:border-citrus/30">
        <button onClick={() => setOpen(!open)} className="group w-full flex items-start justify-between gap-4 text-left">
          <div>
            <h3 className="text-body-lg font-semibold">{project.company}</h3>
            <p className="text-small text-cobalt font-medium mt-1">{project.role}</p>
            {project.period && (
              <span className="inline-block font-mono uppercase text-tag tracking-widest text-ink-subtle border border-ink/10 rounded-full px-3 py-1.5 mt-3">
                {project.period}
              </span>
            )}
          </div>
          <ExpandToggle open={open} />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                {project.overview && (
                  <p className="text-small text-ink-muted">{project.overview}</p>
                )}
                <ul className="mt-4 space-y-2">
                  {project.services.map((service) => (
                    <li key={service} className="flex gap-2.5 items-start text-small text-ink-muted">
                      <span className="size-1 rounded-full bg-citrus inline-block shrink-0 mt-2" aria-hidden />
                      {service}
                    </li>
                  ))}
                </ul>
                {project.note && (
                  <p className="text-small text-ink-subtle mt-4 italic">{project.note}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  );
}

export default function ExperienceAccordion({
  primaryRoles,
  remoteProjects,
}: {
  primaryRoles: PrimaryRole[];
  remoteProjects: RemoteProject[];
}) {
  return (
    <div className="mt-10">
      <Reveal>
        <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle flex items-center gap-2">
          <MapPin className="size-3.5" aria-hidden />
          Primary roles
        </h3>
      </Reveal>
      <div className="mt-6">
        {primaryRoles.map((role, i) => (
          <PrimaryRoleCard key={role.company} role={role} index={i} />
        ))}
      </div>

      <Reveal className="mt-6">
        <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
          Remote & client projects
        </h3>
      </Reveal>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
        {remoteProjects.map((project, i) => (
          <RemoteProjectCard key={project.company} project={project} index={i} />
        ))}
      </div>
    </div>
  );
}
