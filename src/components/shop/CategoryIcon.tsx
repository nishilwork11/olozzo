import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Baby,
  BatteryCharging,
  BookOpen,
  Car,
  Cpu,
  Dumbbell,
  Flower2,
  Footprints,
  Gamepad2,
  Gem,
  Glasses,
  Headphones,
  Heart,
  HeartPulse,
  House,
  Joystick,
  Laptop,
  Lightbulb,
  Luggage,
  Microwave,
  Moon,
  Music,
  Palette,
  PartyPopper,
  PawPrint,
  PencilRuler,
  Scissors,
  ShieldCheck,
  Shirt,
  Smartphone,
  Smile,
  Sparkles,
  Sun,
  Tag,
  Wrench,
} from "lucide-react";

// The lucide icon names used by the category tree (prisma/catalog/categories.json, Category.icon).
// A Map, so a stray name such as "constructor" can never resolve to something that is not an icon.
const ICONS = new Map<string, LucideIcon>([
  ["Baby", Baby],
  ["BatteryCharging", BatteryCharging],
  ["BookOpen", BookOpen],
  ["Car", Car],
  ["Cpu", Cpu],
  ["Dumbbell", Dumbbell],
  ["Flower2", Flower2],
  ["Footprints", Footprints],
  ["Gamepad2", Gamepad2],
  ["Gem", Gem],
  ["Glasses", Glasses],
  ["Headphones", Headphones],
  ["Heart", Heart],
  ["HeartPulse", HeartPulse],
  ["Home", House],
  ["House", House],
  ["Joystick", Joystick],
  ["Laptop", Laptop],
  ["Lightbulb", Lightbulb],
  ["Luggage", Luggage],
  ["Microwave", Microwave],
  ["Moon", Moon],
  ["Music", Music],
  ["Palette", Palette],
  ["PartyPopper", PartyPopper],
  ["PawPrint", PawPrint],
  ["PencilRuler", PencilRuler],
  ["Scissors", Scissors],
  ["ShieldCheck", ShieldCheck],
  ["Shirt", Shirt],
  ["Smartphone", Smartphone],
  ["Smile", Smile],
  ["Sparkles", Sparkles],
  ["Sun", Sun],
  ["Wrench", Wrench],
]);

/** The lucide component for a category's icon name; a tag for unknown or missing names. */
export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS.get(name)) || Tag;
}

/** A category's icon. Decorative: the category name is always shown next to it. */
export function CategoryIcon({ icon, ...props }: { icon: string | null | undefined } & Omit<LucideProps, "ref">) {
  const Icon = categoryIcon(icon);
  return <Icon aria-hidden="true" {...props} />;
}
