<script setup lang="ts">
import { computed } from 'vue'
import { RISK_LABEL, STATUS_LABEL } from '../api/labels'
import type { Risk, Status } from '../api/types'

const props = defineProps<{ status?: Status; risk?: Risk }>()
const cls = computed(() => (props.status ? `s-${props.status}` : `r-${props.risk}`))
const text = computed(() => (props.status ? STATUS_LABEL[props.status] : props.risk ? RISK_LABEL[props.risk] : ''))
</script>

<template>
  <span class="badge" :class="cls">{{ text }}</span>
</template>
