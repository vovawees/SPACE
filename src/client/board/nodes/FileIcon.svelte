<script lang="ts">
  import Archive from "@lucide/svelte/icons/file-archive";
  import FileCode from "@lucide/svelte/icons/file-code";
  import FileHeadphone from "@lucide/svelte/icons/file-headphone";
  import FileImage from "@lucide/svelte/icons/file-image";
  import FilePlay from "@lucide/svelte/icons/file-play";
  import FileSpreadsheet from "@lucide/svelte/icons/file-spreadsheet";
  import FileText from "@lucide/svelte/icons/file-text";
  import FileIconBase from "@lucide/svelte/icons/file";
  import Cpu from "@lucide/svelte/icons/cpu";
  import type { FileKind } from "./cache.ts";

  let { kind, size = 18 }: { kind: FileKind; size?: number } = $props();
  const ICONS = {
    image: FileImage,
    video: FilePlay,
    audio: FileHeadphone,
    pdf: FileText,
    archive: Archive,
    code: FileCode,
    text: FileText,
    app: Cpu,
    doc: FileText,
    sheet: FileSpreadsheet,
    file: FileIconBase,
  };
  const Icon = $derived(ICONS[kind] ?? FileIconBase);
</script>

<Icon {size} strokeWidth={1.6} />
