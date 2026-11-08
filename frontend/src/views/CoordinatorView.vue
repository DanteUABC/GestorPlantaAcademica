<template>
  <v-container fluid class="pa-6">
    <!-- Header with Institution and Action -->
    <div class="d-flex flex-wrap justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold text-primary mb-1">
          <v-icon icon="mdi-calendar-clock" class="mr-2"></v-icon>
          Armado y Gestión de Horarios
        </h1>
        <p class="text-body-1 text-grey-darken-1">
          Coordinación Académica &bull; {{ authStore.tenantName }} &bull; Modelo Multi-tenant sin empalmes
        </p>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          color="info"
          variant="tonal"
          size="large"
          prepend-icon="mdi-chart-box-outline"
          class="text-none font-weight-bold"
          to="/analytics"
        >
          Analítica Operativa
        </v-btn>
        <v-btn
          color="success"
          variant="tonal"
          size="large"
          prepend-icon="mdi-file-excel-box"
          class="text-none font-weight-bold"
          @click="viewTab = 'upload'"
        >
          Carga Masiva Excel
        </v-btn>
        <v-btn
          color="primary"
          size="large"
          prepend-icon="mdi-plus"
          class="text-none font-weight-bold elevation-2"
          @click="openCreateDialog"
        >
          Armar Nuevo Horario
        </v-btn>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <v-row class="mb-6">
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-primary">
          <div class="text-caption text-grey font-weight-bold">GRUPOS ARMADOS</div>
          <div class="text-h4 font-weight-bold text-primary mt-1">{{ schedules.length }}</div>
          <div class="text-caption text-grey mt-1">Horarios activos</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-secondary">
          <div class="text-caption text-grey font-weight-bold">DOCENTES EN PLANTILLA</div>
          <div class="text-h4 font-weight-bold text-secondary mt-1">{{ teachers.length }}</div>
          <div class="text-caption text-grey mt-1">Profesores registrados</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-info">
          <div class="text-caption text-grey font-weight-bold">AULAS DISPONIBLES</div>
          <div class="text-h4 font-weight-bold text-info mt-1">{{ classrooms.length }}</div>
          <div class="text-caption text-grey mt-1">Espacios físicos</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-accent">
          <div class="text-caption text-grey font-weight-bold">MATERIAS OFERTADAS</div>
          <div class="text-h4 font-weight-bold text-accent mt-1">{{ subjects.length }}</div>
          <div class="text-caption text-grey mt-1">Planes de estudio</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Conflict Simulator Banner -->
    <v-alert
      color="purple-lighten-5"
      border="start"
      border-color="purple-accent-4"
      class="mb-6 elevation-1"
    >
      <template #prepend>
        <v-icon icon="mdi-shield-check" color="purple-accent-4" size="large"></v-icon>
      </template>
      <div class="text-subtitle-1 font-weight-bold text-purple-darken-3">
        Motor de Validación Anti-Empalmes Activo
      </div>
      <div class="text-body-2 text-purple-darken-2">
        El sistema valida automáticamente en tiempo real que ningún profesor tenga dos asignaturas al mismo tiempo, ni que dos grupos ocupen la misma aula física en el mismo día y bloque horario. Si intentas forzar un cruce, el servidor responderá con un rechazo preventivo 409 indicando el motivo exacto.
      </div>
    </v-alert>

    <!-- Tabs between Weekly Grid and Data Table -->
    <v-card elevation="2" rounded="lg">
      <div class="d-flex flex-wrap justify-space-between align-center px-4 pt-2 no-print border-b">
        <v-tabs v-model="viewTab" color="primary">
          <v-tab value="grid" prepend-icon="mdi-view-week">Parrilla Semanal de Horarios</v-tab>
          <v-tab value="list" prepend-icon="mdi-format-list-bulleted">Listado Detallado de Grupos</v-tab>
          <v-tab value="upload" prepend-icon="mdi-file-excel-box">Carga Masiva Excel</v-tab>
          <v-tab value="subjects" prepend-icon="mdi-book-education-outline" data-testid="tab-subjects-catalog">Catálogo de Materias</v-tab>
          <v-tab value="teachers" prepend-icon="mdi-account-tie-outline" data-testid="tab-teachers-catalog">Catálogo de Docentes</v-tab>
          <v-tab value="classrooms" to="/classrooms" prepend-icon="mdi-office-building-cog-outline" data-testid="tab-classroom-catalog">Catálogo de Aulas</v-tab>
          <v-tab to="/analytics" prepend-icon="mdi-chart-box-outline">Analítica Operativa</v-tab>
        </v-tabs>
        <div class="d-flex align-center ga-3 my-2">
          <v-select
            v-model="selectedTeacherFilter"
            :items="[{ id: '', name: 'Todos los Docentes' }, ...teachers]"
            item-title="name"
            item-value="id"
            label="Consultar Docente"
            density="compact"
            variant="outlined"
            hide-details
            style="min-width: 240px;"
            prepend-inner-icon="mdi-account-tie"
          ></v-select>
          <v-btn
            color="primary"
            prepend-icon="mdi-printer"
            class="text-none font-weight-bold"
            @click="imprimirHorario"
          >
            Imprimir Horario
          </v-btn>
        </div>
      </div>

      <v-card-text class="pa-4">
        <!-- Información del Docente para Consulta e Impresión -->
        <div v-if="selectedTeacherName" class="mb-4 pa-3 bg-blue-lighten-5 rounded border d-flex justify-space-between align-center">
          <div>
            <div class="text-subtitle-1 font-weight-bold text-primary">
              <v-icon icon="mdi-teach" class="mr-1"></v-icon>
              Horario del Docente: {{ selectedTeacherName }}
            </div>
            <div class="text-caption text-grey-darken-1">
              Institución: {{ authStore.tenantName }} &bull; Carga semanal asignada
            </div>
          </div>
          <v-chip color="primary" variant="tonal" size="small" class="font-weight-bold">
            {{ filteredSchedules.length }} clases asignadas
          </v-chip>
        </div>
        <!-- TAB 1: WEEKLY GRID -->
        <div v-if="viewTab === 'grid'">
          <v-row>
            <v-col
              v-for="day in daysOfWeek"
              :key="day"
              cols="12"
              sm="6"
              md="4"
              lg="2"
            >
              <v-card variant="outlined" class="h-100" rounded="lg">
                <v-card-title class="bg-primary text-white text-center py-2 text-subtitle-1 font-weight-bold">
                  {{ day }}
                </v-card-title>
                <v-divider></v-divider>
                <div class="pa-2">
                  <div v-if="getSchedulesByDay(day).length === 0" class="text-center py-6 text-caption text-grey">
                    Sin clases programadas
                  </div>
                  <v-card
                    v-for="item in getSchedulesByDay(day)"
                    :key="item.id"
                    variant="tonal"
                    color="primary"
                    class="mb-2 pa-2 border rounded"
                  >
                    <div class="d-flex justify-space-between align-start">
                      <div class="text-caption font-weight-bold text-primary">
                        <v-icon icon="mdi-clock-outline" size="x-small"></v-icon>
                        {{ item.start_time }} - {{ item.end_time }}
                      </div>
                      <div class="d-flex ga-1">
                        <v-btn
                          icon="mdi-account-switch"
                          size="x-small"
                          variant="text"
                          color="primary"
                          title="Reasignar docente / Suplente"
                          data-testid="btn-transfer-grid"
                          @click="openTransferModal(item)"
                        ></v-btn>
                        <v-btn
                          icon="mdi-delete-outline"
                          size="x-small"
                          variant="text"
                          color="error"
                          title="Eliminar Horario"
                          @click="handleDeleteSchedule(item.id)"
                        ></v-btn>
                      </div>
                    </div>

                    <div class="text-subtitle-2 font-weight-bold text-slate-800 mt-1">
                      {{ item.subject_name }}
                    </div>
                    <div class="d-flex align-center gap-1 my-1 flex-wrap">
                      <v-chip size="x-small" color="primary" variant="tonal" class="mr-1">
                        Grupo {{ item.group_code || 'G1' }}
                      </v-chip>
                      <v-chip size="x-small" :color="item.session_type === 'Laboratorio' ? 'deep-purple' : 'info'" variant="outlined">
                        {{ item.session_type || 'Clase Teórica' }}
                      </v-chip>
                    </div>
                    <div class="text-caption text-grey-darken-2">
                      <v-icon icon="mdi-account-tie" size="x-small"></v-icon>
                      {{ item.teacher_name }}
                    </div>
                    <div class="text-caption text-grey-darken-2">
                      <v-icon icon="mdi-door" size="x-small"></v-icon>
                      {{ item.classroom_name }}
                    </div>
                    <div class="text-caption text-secondary font-weight-medium mt-1">
                      <v-icon icon="mdi-account-group" size="x-small"></v-icon>
                      Cupo: {{ item.max_students }} alumnos
                    </div>
                  </v-card>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- TAB 2: DETAILED DATA TABLE -->
        <div v-if="viewTab === 'list'">
          <v-table hover>
            <thead>
              <tr>
                <th class="text-left font-weight-bold">Día y Hora</th>
                <th class="text-left font-weight-bold">Materia</th>
                <th class="text-left font-weight-bold">Docente Asignado</th>
                <th class="text-left font-weight-bold">Aula</th>
                <th class="text-left font-weight-bold">Cupo Total</th>
                <th class="text-right font-weight-bold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sch in filteredSchedules" :key="sch.id">
                <td>
                  <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold mr-1">
                    {{ sch.day_of_week }}
                  </v-chip>
                  <span class="text-caption font-weight-medium">{{ sch.start_time }} - {{ sch.end_time }}</span>
                </td>
                <td>
                  <div class="font-weight-bold">{{ sch.subject_name }}</div>
                  <div class="text-caption text-grey">
                    {{ sch.subject_code }} &bull; {{ sch.subject_credits }} créditos &bull;
                    <span class="font-weight-medium">Grupo {{ sch.group_code || 'G1' }}</span> &bull;
                    <span>{{ sch.session_type || 'Clase Teórica' }}</span>
                  </div>
                </td>
                <td>
                  <div class="d-flex align-center">
                    <v-icon icon="mdi-account-tie" size="small" class="mr-1 text-grey"></v-icon>
                    <span>{{ sch.teacher_name }}</span>
                  </div>
                </td>
                <td>
                  <div>{{ sch.classroom_name }}</div>
                  <div class="text-caption text-grey">{{ sch.classroom_building }}</div>
                </td>
                <td>
                  <span class="text-caption">{{ sch.max_students }} lugares</span>
                </td>
                <td class="text-right">
                  <v-btn
                    color="primary"
                    variant="text"
                    size="small"
                    prepend-icon="mdi-account-switch"
                    class="text-none mr-1"
                    data-testid="btn-transfer-list"
                    @click="openTransferModal(sch)"
                  >
                    Reasignar
                  </v-btn>
                  <v-btn
                    color="error"
                    variant="text"
                    size="small"
                    prepend-icon="mdi-delete"
                    class="text-none"
                    @click="handleDeleteSchedule(sch.id)"
                  >
                    Eliminar
                  </v-btn>
                </td>
              </tr>
              <tr v-if="filteredSchedules.length === 0">
                <td colspan="6" class="text-center py-6 text-grey">
                  No hay horarios programados aún. Haz clic en "Armar Nuevo Horario" para crear el primero.
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <!-- TAB 3: CARGA MASIVA EXCEL -->
        <div v-if="viewTab === 'upload'" class="pa-2">
          <ExcelScheduleUploader @upload-success="handleUploadSuccess" />
        </div>
        <!-- TAB 4: CATÁLOGO DE AULAS -->
        <div v-if="viewTab === 'classrooms'" class="pa-2">
          <ClassroomCatalogView @updated="loadData" />
        </div>
        <!-- TAB 5: CATÁLOGO DE MATERIAS -->
        <div v-if="viewTab === 'subjects'" class="pa-2" data-testid="subjects-catalog-tab-content">
          <!-- Barra Superior de Control del Catálogo -->
          <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
            <v-text-field
              v-model="searchSubjectText"
              placeholder="Buscar por nombre o clave..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              style="max-width: 380px; min-width: 250px;"
              data-testid="input-search-subjects"
            ></v-text-field>

            <v-btn
              color="primary"
              prepend-icon="mdi-plus"
              elevation="1"
              class="text-none font-weight-bold"
              data-testid="btn-new-subject"
              @click="openNewSubjectDialog"
            >
              Nueva Materia
            </v-btn>
          </div>

          <!-- Tabla Interactiva de Materias -->
          <v-table class="border rounded" hover>
            <thead>
              <tr class="bg-grey-lighten-4">
                <th class="font-weight-bold">Clave / Código</th>
                <th class="font-weight-bold">Nombre de la Materia</th>
                <th class="font-weight-bold text-center">Créditos</th>
                <th class="font-weight-bold text-center">Cantidad de Grupos Asignados</th>
                <th class="font-weight-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sub in filteredSubjectsList"
                :key="sub.id"
                :data-testid="'row-subject-' + sub.id"
              >
                <td class="font-weight-medium">
                  <span class="text-primary font-weight-bold">{{ sub.code || sub.codigo }}</span>
                </td>
                <td>{{ sub.name || sub.nombre }}</td>
                <td class="text-center">{{ sub.credits ?? sub.creditos ?? 0 }}</td>
                <td class="text-center">
                  <v-chip
                    size="small"
                    :color="(getSubjectAssignedGroups(sub) > 0) ? 'primary' : 'grey'"
                    variant="tonal"
                    class="font-weight-bold"
                    data-testid="chip-assigned-groups"
                  >
                    {{ getSubjectAssignedGroups(sub) }}
                  </v-chip>
                </td>
                <td class="text-right">
                  <v-btn
                    variant="text"
                    size="small"
                    color="primary"
                    icon="mdi-pencil"
                    class="mr-1"
                    data-testid="btn-edit-subject"
                    @click="openEditSubjectDialog(sub)"
                    title="Editar Materia"
                  >
                    <v-icon icon="mdi-pencil"></v-icon>
                  </v-btn>
                  <v-btn
                    variant="text"
                    size="small"
                    color="error"
                    icon="mdi-delete"
                    data-testid="btn-delete-subject"
                    @click="confirmDeleteSubject(sub)"
                    title="Eliminar Materia"
                  >
                    <v-icon icon="mdi-delete"></v-icon>
                  </v-btn>
                </td>
              </tr>
              <tr v-if="filteredSubjectsList.length === 0">
                <td colspan="5" class="text-center py-6 text-grey" data-testid="no-subjects-message">
                  No se encontraron materias que coincidan con la búsqueda.
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <!-- TAB 6: CATÁLOGO DE DOCENTES / MAESTROS -->
        <div v-if="viewTab === 'teachers'" class="pa-2" data-testid="teachers-catalog-tab-content">
          <!-- Barra Superior de Control del Catálogo -->
          <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
            <v-text-field
              v-model="searchTeacherText"
              placeholder="Buscar por nombre, nómina o correo..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              style="max-width: 380px; min-width: 250px;"
              data-testid="input-search-teachers"
              @input="handleTeacherSearchInput"
              @update:model-value="handleTeacherSearchInput"
            ></v-text-field>

            <v-chip
              color="primary"
              variant="tonal"
              size="default"
              class="font-weight-bold"
              data-testid="chip-total-teachers"
            >
              Total de docentes: {{ filteredTeachersList.length }}
            </v-chip>
          </div>

          <!-- Tabla Interactiva de Docentes -->
          <v-table class="border rounded" hover data-testid="teachers-catalog-table">
            <thead>
              <tr class="bg-grey-lighten-4">
                <th class="font-weight-bold">Identificador / Nómina</th>
                <th class="font-weight-bold">Nombre Completo del Docente</th>
                <th class="font-weight-bold">Correo Electrónico Institucional</th>
                <th class="font-weight-bold text-center">Carga Actual vs Contrato</th>
                <th class="font-weight-bold text-center">Estatus de Cuenta</th>
                <th class="font-weight-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="teach in filteredTeachersList"
                :key="teach.id"
                :data-testid="'row-teacher-' + teach.id"
                class="cursor-pointer"
                style="cursor: pointer;"
                @click="openTeacherDetailModal(teach)"
              >
                <td class="font-weight-medium">
                  <span class="text-primary font-weight-bold" data-testid="teacher-identifier">
                    {{ teach.identificador || teach.identifier || 'S/N' }}
                  </span>
                </td>
                <td class="font-weight-medium" data-testid="teacher-name">
                  {{ teach.name || ((teach.nombre || '') + ' ' + (teach.apellidos || '')).trim() }}
                </td>
                <td data-testid="teacher-email">
                  <template v-if="teach.email && teach.email_activo !== false">
                    <span class="text-body-2" data-testid="teacher-email-text">{{ teach.email }}</span>
                  </template>
                  <template v-else>
                    <v-chip
                      size="small"
                      color="grey"
                      variant="tonal"
                      class="font-weight-medium"
                      data-testid="chip-email-revocado"
                    >
                      <v-icon start icon="mdi-email-off-outline" size="14"></v-icon>
                      Sin correo asignado (Revocado)
                    </v-chip>
                  </template>
                </td>
                <td class="text-center" data-testid="teacher-workload">
                  <v-chip
                    size="small"
                    :color="getTeacherWorkloadColor(teach)"
                    variant="flat"
                    class="font-weight-bold text-white"
                    data-testid="chip-teacher-workload"
                  >
                    {{ getTeacherAssignedHours(teach) }} / {{ teach.horas_contratadas ?? teach.max_hours ?? 25 }} hrs
                  </v-chip>
                </td>
                <td class="text-center" data-testid="teacher-status">
                  <v-chip
                    size="small"
                    :color="(teach.estatus === 'activo' || !teach.estatus) ? 'success' : 'grey'"
                    variant="flat"
                    class="font-weight-bold text-uppercase"
                    data-testid="chip-teacher-status"
                  >
                    {{ (teach.estatus === 'activo' || !teach.estatus) ? 'Activo' : 'Inactivo' }}
                  </v-chip>
                </td>
                <td class="text-right" @click.stop>
                  <v-btn
                    variant="text"
                    size="small"
                    color="primary"
                    icon="mdi-eye-outline"
                    data-testid="btn-inspect-teacher"
                    title="Ver Detalle del Docente"
                    @click="openTeacherDetailModal(teach)"
                  >
                    <v-icon icon="mdi-eye-outline"></v-icon>
                  </v-btn>
                </td>
              </tr>
              <tr v-if="filteredTeachersList.length === 0">
                <td colspan="6" class="text-center py-6 text-grey" data-testid="no-teachers-message">
                  No se encontraron docentes que coincidan con la búsqueda.
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </v-card-text>
    </v-card>

    <!-- DIALOG: ARMAR NUEVO HORARIO -->
    <v-dialog v-model="createDialog" max-width="600" persistent>
      <v-card rounded="lg" elevation="6">
        <v-card-title class="bg-primary text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold">
            <v-icon icon="mdi-calendar-plus" class="mr-2"></v-icon>
            Armar Nuevo Horario
          </span>
          <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="createDialog = false"></v-btn>
        </v-card-title>

        <v-card-text class="pa-5">
          <!-- Empalme Conflict Error Alert -->
          <v-alert
            v-if="conflictError"
            type="error"
            variant="tonal"
            class="mb-4"
            density="comfortable"
            closable
            @click:close="conflictError = ''"
          >
            <div class="font-weight-bold">¡Conflicto de Horario Detectado!</div>
            <div class="text-body-2 mt-1">{{ conflictError }}</div>
          </v-alert>

          <v-form @submit.prevent="submitSchedule">
            <!-- Materia (con barra de búsqueda y botón de alta rápida) -->
            <v-autocomplete
              v-model="newSchedule.subject_id"
              :items="subjects"
              item-title="name"
              item-value="id"
              label="Materia *"
              placeholder="Buscar materia por nombre o clave..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-magnify"
              class="mb-2"
              clearable
              auto-select-first
              :custom-filter="filterSubjects"
              :rules="[v => !!v || 'Seleccione una materia']"
              no-data-text="No se encontraron materias que coincidan con la búsqueda"
              data-testid="schedule-subject-autocomplete"
            >
              <template #append-inner>
                <v-btn
                  icon="mdi-plus"
                  size="small"
                  color="success"
                  variant="tonal"
                  title="Alta Rápida de Materia"
                  data-testid="btn-quick-subject"
                  @click.stop.prevent="openQuickSubjectModal"
                ></v-btn>
              </template>
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :title="item.raw.name"
                  :subtitle="`Código: ${item.raw.code} | Créditos: ${item.raw.credits}`"
                >
                  <template #prepend>
                    <v-icon icon="mdi-book-open-page-variant" class="mr-2 text-primary" size="small"></v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>

            <!-- Maestro / Docente (con barra de búsqueda) -->
            <v-autocomplete
              v-model="newSchedule.teacher_id"
              :items="teachers"
              item-title="name"
              item-value="id"
              label="Maestro *"
              placeholder="Buscar maestro por nombre, nómina o correo..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-magnify"
              class="mb-2"
              clearable
              auto-select-first
              :custom-filter="filterTeachers"
              :rules="[v => !!v || 'Seleccione un maestro']"
              no-data-text="No se encontraron maestros que coincidan con la búsqueda"
            >
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :title="item.raw.name"
                  :subtitle="item.raw.email ? `${item.raw.email}${item.raw.identifier ? ' • ID: ' + item.raw.identifier : ''}` : (item.raw.identifier ? 'ID: ' + item.raw.identifier : '')"
                >
                  <template #prepend>
                    <v-icon icon="mdi-account-tie" class="mr-2 text-secondary" size="small"></v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>

            <!-- Medidor Visual de Carga Laboral del Docente -->
            <div v-if="newSchedule.teacher_id" class="mb-3 teacher-workload-container">
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-caption font-weight-medium text-medium-emphasis">
                  {{ teacherMeterText }}
                </span>
                <span
                  class="text-caption font-weight-bold"
                  :class="{
                    'text-success': teacherMeterColor === 'success',
                    'text-warning': teacherMeterColor === 'warning',
                    'text-error': teacherMeterColor === 'error'
                  }"
                >
                  {{ teacherLoadPercentage }}% asignado
                </span>
              </div>
              <v-progress-linear
                :model-value="Math.min(100, teacherLoadPercentage)"
                :color="teacherMeterColor"
                height="22"
                rounded
                class="elevation-1"
                :data-color="teacherMeterColor"
                :data-color-name="teacherMeterColorName"
              >
                <template #default>
                  <strong class="text-caption font-weight-bold text-white px-2 text-truncate">
                    {{ teacherMeterText }}
                  </strong>
                </template>
              </v-progress-linear>
              <div v-if="totalHoursWithPending > maxWeeklyHours" class="text-caption text-error font-weight-medium mt-1">
                <v-icon icon="mdi-alert" size="x-small" class="mr-1"></v-icon>
                Esta clase de {{ pendingClassHours }} hrs haría que el docente supere su límite semanal ({{ totalHoursWithPending }} / {{ maxWeeklyHours }} hrs).
              </div>
            </div>

            <!-- Aula Física (con botón de alta rápida) -->
            <v-select
              v-model="newSchedule.classroom_id"
              :items="classroomOptions"
              item-title="displayName"
              item-value="id"
              label="Aula Física *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-door"
              class="mb-2"
              :rules="[v => !!v || 'Seleccione un aula']"
              data-testid="schedule-classroom-select"
              @update:model-value="onClassroomChange"
            >
              <template #append-inner>
                <v-btn
                  icon="mdi-plus"
                  size="small"
                  color="success"
                  variant="tonal"
                  title="Alta Rápida de Aula"
                  data-testid="btn-quick-classroom"
                  @click.stop.prevent="openQuickClassroomModal"
                ></v-btn>
              </template>
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :title="formatClassroomOption(item.raw)"
                  :subtitle="item.raw.building ? `Edificio: ${item.raw.building}` : undefined"
                >
                  <template #prepend>
                    <v-icon icon="mdi-door" class="mr-2 text-secondary" size="small"></v-icon>
                  </template>
                </v-list-item>
              </template>
              <template #selection="{ item }">
                <span>{{ formatClassroomOption(item.raw) }}</span>
              </template>
            </v-select>

            <!-- Tipo de Sesión y Código de Grupo -->
            <v-row class="mb-1">
              <v-col cols="12" sm="6">
                <v-select
                  v-model="newSchedule.session_type"
                  :items="['Clase Teórica', 'Laboratorio', 'Taller']"
                  label="Tipo de Sesión *"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-format-list-bulleted-type"
                  :rules="[v => !!v || 'Seleccione el tipo de sesión']"
                  :error="isLabMismatch"
                  :error-messages="isLabMismatch ? ['Requiere aula de tipo Laboratorio'] : []"
                ></v-select>
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="newSchedule.group_code"
                  label="Código de Grupo"
                  placeholder="ej. 501, G1"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-account-group"
                  hint="Por defecto: G1"
                  persistent-hint
                ></v-text-field>
              </v-col>
            </v-row>

            <!-- Alerta visual de incoherencia entre tipo de sesión y tipo de aula -->
            <v-alert
              v-if="isLabMismatch"
              type="warning"
              density="compact"
              variant="tonal"
              color="error"
              class="mb-3 text-caption font-weight-medium"
              icon="mdi-flask-empty-off"
            >
              <strong>Incoherencia de Espacio:</strong>
              {{ labMismatchWarningMessage }}
            </v-alert>

            <!-- Día de la semana -->
            <v-select
              v-model="newSchedule.day_of_week"
              :items="daysOfWeek"
              label="Día de la Semana *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-calendar-today"
              class="mb-2"
              :rules="[v => !!v || 'Seleccione el día']"
            ></v-select>

            <!-- Rango Horario -->
            <v-row class="mb-1">
              <v-col cols="12" sm="6">
                <v-select
                  v-model="newSchedule.start_time"
                  :items="timeSlots"
                  label="Hora de Inicio *"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-clock-start"
                  :rules="[v => !!v || 'Hora requerida']"
                ></v-select>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="newSchedule.end_time"
                  :items="timeSlots"
                  label="Hora de Fin *"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-clock-end"
                  :rules="[v => !!v || 'Hora requerida']"
                ></v-select>
              </v-col>
            </v-row>

            <!-- Cupo Máximo -->
            <v-text-field
              v-model.number="newSchedule.max_students"
              label="Cupo Máximo de Alumnos"
              type="number"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account-multiple"
              :class="isCapacityExceeded ? 'mb-1' : 'mb-4'"
              min="1"
              max="100"
              :error="isCapacityExceeded"
              :error-messages="isCapacityExceeded ? [capacityWarningMessage] : []"
              :messages="!isCapacityExceeded && selectedClassroom ? [`Capacidad máxima del aula: ${selectedClassroom.capacity} alumnos`] : []"
            ></v-text-field>

            <!-- Alerta visual de sobrecupo en tiempo real (ámbar / rojo) -->
            <v-alert
              v-if="isCapacityExceeded"
              type="warning"
              density="compact"
              variant="tonal"
              color="warning"
              class="mb-4 text-caption font-weight-medium"
              icon="mdi-alert-circle"
            >
              <strong>Advertencia de Sobrecupo:</strong>
              El aforo máximo del espacio físico seleccionado ({{ selectedClassroom?.name }}) es de <strong>{{ selectedClassroom?.capacity }}</strong> alumnos.
              Reduce el cupo para poder guardar el horario.
            </v-alert>

            <div class="d-flex justify-end gap-2">
              <v-btn variant="text" class="text-none mr-2" @click="createDialog = false">
                Cancelar
              </v-btn>
              <v-btn
                type="submit"
                color="primary"
                class="text-none font-weight-bold"
                :loading="submitting"
                :disabled="isCapacityExceeded || isLabMismatch || submitting"
              >
                Guardar Horario
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- DIALOG SECUNDARIO ANIDADO: ALTA RÁPIDA DE MATERIA -->
    <v-dialog
      v-model="isQuickSubjectModalOpen"
      max-width="460"
      persistent
      data-testid="quick-subject-dialog"
    >
      <v-card rounded="lg" elevation="8">
        <v-card-title class="bg-success text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold d-flex align-center">
            <v-icon icon="mdi-book-plus-outline" class="mr-2"></v-icon>
            Alta Rápida de Materia
          </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            density="compact"
            data-testid="btn-close-quick-subject"
            @click="closeQuickSubjectModal"
          ></v-btn>
        </v-card-title>

        <v-card-text class="pa-5">
          <v-alert
            v-if="quickSubjectError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
            closable
            data-testid="quick-subject-error"
            @click:close="quickSubjectError = ''"
          >
            {{ quickSubjectError }}
          </v-alert>

          <v-form @submit.prevent="submitQuickSubject" data-testid="quick-subject-form">
            <v-text-field
              v-model="quickSubjectForm.code"
              label="Clave / Código de la Materia *"
              placeholder="Ej. MAT-101, INF-302"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-barcode"
              class="mb-3"
              :rules="[v => !!(v && String(v).trim()) || 'El código es obligatorio']"
              data-testid="input-quick-subject-code"
            ></v-text-field>

            <v-text-field
              v-model="quickSubjectForm.name"
              label="Nombre de la Materia *"
              placeholder="Ej. Estructura de Datos"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-book-open-variant"
              class="mb-3"
              :rules="[v => !!(v && String(v).trim()) || 'El nombre de la materia es obligatorio']"
              data-testid="input-quick-subject-name"
            ></v-text-field>

            <v-text-field
              v-model.number="quickSubjectForm.credits"
              label="Créditos"
              type="number"
              min="1"
              max="20"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-star-outline"
              class="mb-4"
              data-testid="input-quick-subject-credits"
            ></v-text-field>

            <div class="d-flex justify-end ga-2">
              <v-btn
                variant="text"
                class="text-none"
                data-testid="btn-cancel-quick-subject"
                @click="closeQuickSubjectModal"
              >
                Cancelar
              </v-btn>
              <v-btn
                type="submit"
                color="success"
                class="text-none font-weight-bold"
                :loading="savingQuickSubject"
                data-testid="btn-save-quick-subject"
              >
                Guardar y Seleccionar
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- DIALOG SECUNDARIO ANIDADO: ALTA RÁPIDA DE AULA -->
    <v-dialog
      v-model="isQuickClassroomModalOpen"
      max-width="500"
      persistent
      data-testid="quick-classroom-dialog"
    >
      <v-card rounded="lg" elevation="8">
        <v-card-title class="bg-success text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold d-flex align-center">
            <v-icon icon="mdi-office-building-plus-outline" class="mr-2"></v-icon>
            Alta Rápida de Aula
          </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            density="compact"
            data-testid="btn-close-quick-classroom"
            @click="closeQuickClassroomModal"
          ></v-btn>
        </v-card-title>

        <v-card-text class="pa-5">
          <v-alert
            v-if="quickClassroomError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
            closable
            data-testid="quick-classroom-error"
            @click:close="quickClassroomError = ''"
          >
            {{ quickClassroomError }}
          </v-alert>

          <v-form @submit.prevent="submitQuickClassroom" data-testid="quick-classroom-form">
            <v-text-field
              v-model="quickClassroomForm.name"
              label="Nombre del Espacio *"
              placeholder="Ej. Aula B-202, Lab Redes..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-door"
              class="mb-3"
              :rules="[v => !!(v && String(v).trim()) || 'El nombre del espacio es obligatorio']"
              data-testid="input-quick-classroom-name"
            ></v-text-field>

            <v-combobox
              v-model="quickClassroomForm.building"
              :items="existingClassroomBuildings"
              label="Edificio / Zona *"
              placeholder="Selecciona o escribe un edificio..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-office-building"
              class="mb-3"
              :rules="[v => !!(v && String(v).trim()) || 'El edificio o zona es obligatorio']"
              data-testid="input-quick-classroom-building"
            ></v-combobox>

            <v-text-field
              v-model.number="quickClassroomForm.capacity"
              label="Capacidad *"
              type="number"
              min="1"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account-group"
              class="mb-3"
              :rules="quickClassroomCapacityRules"
              data-testid="input-quick-classroom-capacity"
            ></v-text-field>

            <v-select
              v-model="quickClassroomForm.type"
              :items="quickClassroomSpaceTypes"
              label="Tipo de Instalación *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-domain"
              class="mb-4"
              :rules="[v => !!(v && String(v).trim()) || 'Seleccione un tipo de instalación']"
              data-testid="input-quick-classroom-type"
            ></v-select>

            <div class="d-flex justify-end ga-2">
              <v-btn
                variant="text"
                class="text-none"
                data-testid="btn-cancel-quick-classroom"
                @click="closeQuickClassroomModal"
              >
                Cancelar
              </v-btn>
              <v-btn
                type="submit"
                color="success"
                class="text-none font-weight-bold"
                :loading="savingQuickClassroom"
                data-testid="btn-save-quick-classroom"
              >
                Guardar y Seleccionar
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- DIALOG: UNIFICADO REGISTRO / EDICIÓN DE MATERIA -->
    <v-dialog
      v-model="subjectDialog"
      max-width="500"
      persistent
      data-testid="dialog-subject"
    >
      <v-card rounded="lg" elevation="8">
        <v-card-title class="bg-primary text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold d-flex align-center">
            <v-icon :icon="isEditingSubject ? 'mdi-pencil-outline' : 'mdi-plus-circle-outline'" class="mr-2"></v-icon>
            {{ isEditingSubject ? 'Editar Materia' : 'Nueva Materia' }}
          </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            density="compact"
            data-testid="btn-close-subject-dialog"
            @click="closeSubjectDialog"
          ></v-btn>
        </v-card-title>

        <v-card-text class="pa-5">
          <v-alert
            v-if="subjectError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
            closable
            data-testid="subject-error"
            @click:close="subjectError = ''"
          >
            {{ subjectError }}
          </v-alert>

          <v-form @submit.prevent="saveSubject" data-testid="subject-form">
            <v-text-field
              v-model="subjectForm.code"
              @input="onSubjectCodeInput"
              label="Clave / Código *"
              placeholder="Ej. MAT-101, PROG-2"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-barcode"
              class="mb-3"
              :rules="[v => !!(v && String(v).trim()) || 'El código o clave es obligatorio']"
              data-testid="input-subject-code"
            ></v-text-field>

            <v-text-field
              v-model="subjectForm.name"
              label="Nombre de la Materia *"
              placeholder="Ej. Cálculo Diferencial"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-book-open-variant"
              class="mb-3"
              :rules="[v => !!(v && String(v).trim()) || 'El nombre de la materia es obligatorio']"
              data-testid="input-subject-name"
            ></v-text-field>

            <v-text-field
              v-model.number="subjectForm.credits"
              label="Créditos (1 a 20) *"
              type="number"
              min="1"
              max="20"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-star-outline"
              class="mb-4"
              :rules="subjectCreditsRules"
              data-testid="input-subject-credits"
            ></v-text-field>

            <div class="d-flex justify-end ga-2">
              <v-btn
                variant="text"
                class="text-none"
                data-testid="btn-cancel-subject"
                @click="closeSubjectDialog"
              >
                Cancelar
              </v-btn>
              <v-btn
                type="submit"
                color="primary"
                class="text-none font-weight-bold"
                :loading="savingSubject"
                data-testid="btn-save-subject"
              >
                {{ isEditingSubject ? 'Actualizar Materia' : 'Guardar Materia' }}
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- DIALOG: CONFIRMACIÓN DE BORRADO DE MATERIA -->
    <v-dialog
      v-model="deleteSubjectDialog"
      max-width="500"
      persistent
      data-testid="dialog-delete-subject"
    >
      <v-card rounded="lg" elevation="8">
        <v-card-title class="bg-error text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold d-flex align-center">
            <v-icon icon="mdi-alert-circle-outline" class="mr-2"></v-icon>
            Confirmar Eliminación
          </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            density="compact"
            data-testid="btn-close-delete-subject"
            @click="closeDeleteSubjectDialog"
          ></v-btn>
        </v-card-title>
        <v-card-text class="pa-5">
          <p class="text-body-1" data-testid="text-confirm-delete-subject">
            ¿Está seguro de eliminar la materia <strong>{{ subjectToDelete?.name || subjectToDelete?.nombre }}</strong> (<strong>{{ subjectToDelete?.code || subjectToDelete?.codigo }}</strong>)? Esta acción no se puede deshacer.
          </p>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0 d-flex justify-end ga-2">
          <v-btn
            variant="text"
            class="text-none"
            data-testid="btn-cancel-delete-subject"
            @click="closeDeleteSubjectDialog"
          >
            Cancelar
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            class="text-none font-weight-bold"
            :loading="deletingSubject"
            data-testid="btn-confirm-delete-subject"
            @click="executeDeleteSubject"
          >
            Eliminar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG: MINIVENTANA DE DETALLE DE DOCENTE -->
    <v-dialog v-model="teacherDetailDialog" max-width="550" data-testid="dialog-teacher-detail">
      <v-card v-if="selectedTeacherDetail" rounded="lg" elevation="6">
        <v-card-title class="bg-primary text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold">
            <v-icon icon="mdi-account-details-outline" class="mr-2"></v-icon>
            Detalle del Docente
          </span>
          <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="teacherDetailDialog = false" data-testid="btn-close-detail-modal-top"></v-btn>
        </v-card-title>
        <v-card-text class="pa-5">
          <div class="d-flex align-center mb-4">
            <v-avatar color="primary" size="48" class="mr-3 text-white font-weight-bold text-h6">
              {{ (selectedTeacherDetail.name || selectedTeacherDetail.nombre || 'P').charAt(0).toUpperCase() }}
            </v-avatar>
            <div>
              <div class="text-h6 font-weight-bold" data-testid="detail-teacher-name">
                {{ selectedTeacherDetail.name || ((selectedTeacherDetail.nombre || '') + ' ' + (selectedTeacherDetail.apellidos || '')).trim() }}
              </div>
              <div class="text-subtitle-2 text-grey-darken-1" data-testid="detail-teacher-identifier">
                Nómina / Identificador: {{ selectedTeacherDetail.identificador || selectedTeacherDetail.identifier || 'S/N' }}
              </div>
            </div>
          </div>
          <v-divider class="mb-4"></v-divider>
          <v-row dense>
            <v-col cols="12" class="mb-2">
              <span class="text-caption text-grey font-weight-bold d-block">CORREO INSTITUCIONAL</span>
              <template v-if="selectedTeacherDetail.email && selectedTeacherDetail.email_activo !== false">
                <span class="text-body-1 font-weight-medium" data-testid="detail-teacher-email">{{ selectedTeacherDetail.email }}</span>
              </template>
              <template v-else>
                <v-chip size="small" color="grey" variant="tonal" class="mt-1 font-weight-bold" data-testid="detail-teacher-email-revoked">
                  <v-icon start icon="mdi-email-off-outline" size="14"></v-icon>
                  Sin correo asignado (Revocado)
                </v-chip>
              </template>
            </v-col>
            <v-col cols="6" class="mb-2">
              <span class="text-caption text-grey font-weight-bold d-block">ESTATUS DE CUENTA</span>
              <v-chip
                size="small"
                :color="(selectedTeacherDetail.estatus === 'activo' || !selectedTeacherDetail.estatus) ? 'success' : 'grey'"
                variant="flat"
                class="font-weight-bold text-uppercase mt-1"
                data-testid="detail-teacher-status"
              >
                {{ (selectedTeacherDetail.estatus === 'activo' || !selectedTeacherDetail.estatus) ? 'Activo' : 'Inactivo' }}
              </v-chip>
            </v-col>
            <v-col cols="6" class="mb-2">
              <span class="text-caption text-grey font-weight-bold d-block">GRUPOS ASIGNADOS</span>
              <span class="text-body-1 font-weight-bold" data-testid="detail-teacher-groups">
                {{ getTeacherGroupsCount(selectedTeacherDetail) }} grupos
              </span>
            </v-col>
            <v-col cols="12" class="mb-2">
              <span class="text-caption text-grey font-weight-bold d-block">CARGA LECTIVA SEMANAL</span>
              <div class="d-flex align-center justify-space-between mt-1 mb-1">
                <span class="text-body-2 font-weight-bold" data-testid="detail-teacher-workload-text">
                  {{ getTeacherAssignedHours(selectedTeacherDetail) }} / {{ selectedTeacherDetail.horas_contratadas ?? selectedTeacherDetail.max_hours ?? 25 }} horas
                </span>
                <span class="text-caption text-grey">
                  {{ Math.max(0, (selectedTeacherDetail.horas_contratadas ?? selectedTeacherDetail.max_hours ?? 25) - getTeacherAssignedHours(selectedTeacherDetail)) }} hrs disponibles
                </span>
              </div>
              <v-progress-linear
                :model-value="Math.min(100, ((getTeacherAssignedHours(selectedTeacherDetail) / (selectedTeacherDetail.horas_contratadas ?? selectedTeacherDetail.max_hours ?? 25)) * 100))"
                :color="getTeacherWorkloadColor(selectedTeacherDetail)"
                height="8"
                rounded
              ></v-progress-linear>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4 bg-grey-lighten-4 justify-end">
          <v-btn color="primary" variant="flat" class="text-none font-weight-bold" @click="teacherDetailDialog = false" data-testid="btn-close-detail-modal">
            Cerrar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- MODAL DE TRANSFERENCIA Y SUPLENCIAS -->
    <ScheduleTransferModal
      v-model="isTransferModalOpen"
      :schedule="selectedScheduleForTransfer"
      @transferred="handleTransferSuccess"
    />

    <!-- Global Snackbar -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';
import ExcelScheduleUploader from '../components/ExcelScheduleUploader.vue';
import ClassroomCatalogView from './ClassroomCatalogView.vue';
import ScheduleTransferModal from '../components/ScheduleTransferModal.vue';

const authStore = useAuthStore();

const emit = defineEmits([
  'teacher-selected',
  'open-teacher-detail'
]);

// Catálogo de Docentes (Búsqueda con debounce de 200ms, métricas reactivas y modal de detalle)
const searchTeacherText = ref('');
const debouncedTeacherSearch = ref('');
let teacherSearchTimer = null;

function handleTeacherSearchInput(val) {
  const query = typeof val === 'string' ? val : (searchTeacherText.value || '');
  if (teacherSearchTimer) {
    clearTimeout(teacherSearchTimer);
  }
  teacherSearchTimer = setTimeout(() => {
    debouncedTeacherSearch.value = query;
  }, 200);
}

watch(searchTeacherText, (newVal) => {
  if (teacherSearchTimer) {
    clearTimeout(teacherSearchTimer);
  }
  if (!newVal) {
    debouncedTeacherSearch.value = '';
    return;
  }
  teacherSearchTimer = setTimeout(() => {
    debouncedTeacherSearch.value = newVal;
  }, 200);
});

function getTeacherAssignedHours(t) {
  if (!t) return 0;
  if (t.horas_asignadas !== undefined && t.horas_asignadas !== null) {
    return Number(t.horas_asignadas);
  }
  return schedules.value
    .filter(s => s.teacher_id === t.id)
    .reduce((sum, s) => sum + calculateScheduleDurationHours(s.start_time, s.end_time), 0);
}

function getTeacherGroupsCount(t) {
  if (!t) return 0;
  if (t.grupos_asignados_count !== undefined && t.grupos_asignados_count !== null) {
    return Number(t.grupos_asignados_count);
  }
  const teacherSchedules = schedules.value.filter(s => s.teacher_id === t.id);
  const groups = new Set(teacherSchedules.map(s => s.group_code || 'G1'));
  return groups.size;
}

function getTeacherWorkloadColor(teach) {
  if (!teach) return 'grey';
  const assigned = getTeacherAssignedHours(teach);
  const maxH = Number(teach.horas_contratadas) || Number(teach.max_hours) || 25;
  if (assigned === 0) return 'grey';
  if (assigned > maxH) return 'error';
  if (assigned >= maxH * 0.8) return 'warning';
  return 'success';
}

const filteredTeachersList = computed(() => {
  const raw = debouncedTeacherSearch.value || searchTeacherText.value || '';
  const text = raw.trim();
  if (!text) {
    return teachers.value;
  }
  const q = normalizeSearchText(text);
  return teachers.value.filter(t => {
    const fullName = normalizeSearchText(t.name || ((t.nombre || '') + ' ' + (t.apellidos || '')).trim());
    const idf = normalizeSearchText(t.identificador || t.identifier || '');
    const email = normalizeSearchText(t.email || '');
    return fullName.includes(q) || idf.includes(q) || email.includes(q);
  });
});

const teacherDetailDialog = ref(false);
const selectedTeacherDetail = ref(null);

function openTeacherDetailModal(teach) {
  selectedTeacherDetail.value = teach;
  teacherDetailDialog.value = true;
  emit('teacher-selected', teach);
  emit('open-teacher-detail', teach);
}


const isTransferModalOpen = ref(false);
const selectedScheduleForTransfer = ref(null);

function openTransferModal(schedule) {
  selectedScheduleForTransfer.value = schedule;
  isTransferModalOpen.value = true;
}

function handleTransferSuccess(payload) {
  snackbar.value = {
    show: true,
    text: payload?.data?.message || '¡Horario reasignado y suplencia registrada exitosamente!',
    color: 'success'
  };
  loadData();
}

const viewTab = ref('grid');
const schedules = ref([]);
const subjects = ref([]);
const teachers = ref([]);
const classrooms = ref([]);

const formatClassroomOption = (cr) => {
  if (!cr) return '';
  const typeText = cr.type ? cr.type : 'Aula Teórica';
  return `${cr.name} • ${typeText} • Capacidad: ${cr.capacity}`;
};

const classroomOptions = computed(() => {
  return classrooms.value.map(cr => ({
    ...cr,
    displayName: formatClassroomOption(cr)
  }));
});

const selectedClassroom = computed(() => {
  return classrooms.value.find(c => c.id === newSchedule.value.classroom_id) || null;
});

const isCapacityExceeded = computed(() => {
  if (!selectedClassroom.value) return false;
  const requested = Number(newSchedule.value.max_students);
  if (!requested || isNaN(requested)) return false;
  return requested > selectedClassroom.value.capacity;
});

const capacityWarningMessage = computed(() => {
  if (!selectedClassroom.value || !isCapacityExceeded.value) return '';
  return `¡Sobrecupo detectado! El cupo ingresado (${newSchedule.value.max_students} alumnos) excede la capacidad máxima del aula "${selectedClassroom.value.name}" (${selectedClassroom.value.capacity} alumnos).`;
});

const isLabMismatch = computed(() => {
  if (!selectedClassroom.value || !newSchedule.value.session_type) return false;
  const isLabSession = /^laboratorio$/i.test(newSchedule.value.session_type);
  if (!isLabSession) return false;
  const crType = selectedClassroom.value.type || '';
  const isLabCr = /laboratorio/i.test(crType) || /lab/i.test(crType);
  return !isLabCr;
});

const labMismatchWarningMessage = computed(() => {
  if (!selectedClassroom.value || !isLabMismatch.value) return '';
  return `Una sesión de tipo "Laboratorio" requiere un aula física de tipo "Laboratorio". El aula "${selectedClassroom.value.name}" es de tipo "${selectedClassroom.value.type || 'Aula Teórica'}".`;
});

// Medidor reactivo de carga horaria del docente
function calculateScheduleDurationHours(startTime, endTime) {
  if (!startTime || !endTime || typeof startTime !== 'string' || typeof endTime !== 'string') return 0;
  const sParts = startTime.split(':').map(Number);
  const eParts = endTime.split(':').map(Number);
  if (sParts.length < 2 || eParts.length < 2 || isNaN(sParts[0]) || isNaN(eParts[0])) return 0;
  const startMin = sParts[0] * 60 + sParts[1];
  const endMin = eParts[0] * 60 + eParts[1];
  return Math.max(0, (endMin - startMin) / 60);
}

const selectedTeacher = computed(() => {
  return teachers.value.find(t => t.id === newSchedule.value.teacher_id) || null;
});

const currentAssignedHours = computed(() => {
  if (!newSchedule.value.teacher_id) return 0;
  return schedules.value
    .filter(s => s.teacher_id === newSchedule.value.teacher_id)
    .reduce((sum, s) => sum + calculateScheduleDurationHours(s.start_time, s.end_time), 0);
});

const maxWeeklyHours = computed(() => {
  if (!selectedTeacher.value) return 25;
  return selectedTeacher.value.max_hours || selectedTeacher.value.horas_maximas || 25;
});

const availableHours = computed(() => {
  return Math.max(0, maxWeeklyHours.value - currentAssignedHours.value);
});

const pendingClassHours = computed(() => {
  if (!newSchedule.value.start_time || !newSchedule.value.end_time) return 0;
  return calculateScheduleDurationHours(newSchedule.value.start_time, newSchedule.value.end_time);
});

const totalHoursWithPending = computed(() => {
  return currentAssignedHours.value + pendingClassHours.value;
});

const teacherLoadPercentage = computed(() => {
  if (!maxWeeklyHours.value) return 0;
  return Math.round((currentAssignedHours.value / maxWeeklyHours.value) * 100);
});

const totalLoadPercentageWithPending = computed(() => {
  if (!maxWeeklyHours.value) return 0;
  return Math.round((totalHoursWithPending.value / maxWeeklyHours.value) * 100);
});

const teacherMeterColor = computed(() => {
  // Rojo: Si la clase en proceso de asignación superaría el 100% (o si ya supera el 100%)
  if (totalHoursWithPending.value > maxWeeklyHours.value || currentAssignedHours.value > maxWeeklyHours.value) {
    return 'error';
  }
  // Ámbar: Entre 80% y 100%
  const relevantPercentage = Math.max(teacherLoadPercentage.value, totalLoadPercentageWithPending.value);
  if (relevantPercentage >= 80 && relevantPercentage <= 100) {
    return 'warning';
  }
  // Verde: Menor al 80% de su capacidad
  return 'success';
});

const teacherMeterColorName = computed(() => {
  if (teacherMeterColor.value === 'error') return 'rojo';
  if (teacherMeterColor.value === 'warning') return 'ambar';
  return 'verde';
});

const teacherMeterText = computed(() => {
  const assigned = currentAssignedHours.value;
  const max = maxWeeklyHours.value;
  const available = availableHours.value;
  return `Horas: ${assigned} / ${max} hrs semanales (${available} hrs disponibles)`;
});
const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const selectedTeacherFilter = ref('');

const selectedTeacherName = computed(() => {
  if (!selectedTeacherFilter.value) return '';
  const t = teachers.value.find(teach => teach.id === selectedTeacherFilter.value);
  return t ? t.name : '';
});

const filteredSchedules = computed(() => {
  if (!selectedTeacherFilter.value) return schedules.value;
  return schedules.value.filter(s => s.teacher_id === selectedTeacherFilter.value);
});

function imprimirHorario() {
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

const timeSlots = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
];

const createDialog = ref(false);
const submitting = ref(false);
const conflictError = ref('');

// Estado exclusivo del Diálogo Secundario: Alta Rápida de Materia
const isQuickSubjectModalOpen = ref(false);
const savingQuickSubject = ref(false);
const quickSubjectError = ref('');
const quickSubjectForm = ref({
  code: '',
  name: '',
  credits: 4
});

function openQuickSubjectModal() {
  quickSubjectError.value = '';
  quickSubjectForm.value = {
    code: '',
    name: '',
    credits: 4
  };
  isQuickSubjectModalOpen.value = true;
}

function closeQuickSubjectModal() {
  isQuickSubjectModalOpen.value = false;
  quickSubjectError.value = '';
  quickSubjectForm.value = {
    code: '',
    name: '',
    credits: 4
  };
}

async function submitQuickSubject() {
  quickSubjectError.value = '';
  const code = String(quickSubjectForm.value.code || '').trim().toUpperCase();
  const name = String(quickSubjectForm.value.name || '').trim();
  const credits = Number(quickSubjectForm.value.credits) > 0 ? Number(quickSubjectForm.value.credits) : 4;

  if (!code || !name) {
    quickSubjectError.value = 'El código y nombre de la materia son obligatorios.';
    return null;
  }

  savingQuickSubject.value = true;
  try {
    const res = await api.post('/subjects', { code, name, credits });
    const createdSubject = res.data;

    // 1. Inyectar la nueva materia en la lista reactiva de opciones
    subjects.value.push(createdSubject);

    // 2. Asignar automáticamente el id de la nueva materia al v-model del selector del formulario padre
    newSchedule.value.subject_id = createdSubject.id;

    // 3. Cerrar el diálogo secundario y limpiar su formulario sin cerrar ni resetear el formulario padre
    closeQuickSubjectModal();

    snackbar.value = {
      show: true,
      text: `Materia "${createdSubject.name}" creada y seleccionada automáticamente`,
      color: 'success'
    };

    return createdSubject;
  } catch (err) {
    quickSubjectError.value = err.response?.data?.error || 'Error al registrar la materia.';
    return null;
  } finally {
    savingQuickSubject.value = false;
  }
}

// Estado exclusivo del Diálogo Secundario: Alta Rápida de Aula
const isQuickClassroomModalOpen = ref(false);
const savingQuickClassroom = ref(false);
const quickClassroomError = ref('');
const quickClassroomSpaceTypes = [
  'Aula Teórica',
  'Laboratorio de Cómputo',
  'Taller',
  'Auditorio'
];
const quickClassroomCapacityRules = [
  v => v > 0 || 'Capacidad debe ser mayor a 0'
];
const quickClassroomForm = ref({
  name: '',
  building: '',
  capacity: 30,
  type: 'Aula Teórica'
});

const existingClassroomBuildings = computed(() => {
  const set = new Set(
    classrooms.value
      .map(c => c.building)
      .filter(b => b && String(b).trim())
  );
  return Array.from(set).sort();
});

function onClassroomChange(selectedId) {
  const found = classrooms.value.find(c => c.id === selectedId);
  if (found && found.capacity > 0) {
    newSchedule.value.max_students = Number(found.capacity);
  }
}

function openQuickClassroomModal() {
  quickClassroomError.value = '';
  quickClassroomForm.value = {
    name: '',
    building: '',
    capacity: 30,
    type: 'Aula Teórica'
  };
  isQuickClassroomModalOpen.value = true;
}

function closeQuickClassroomModal() {
  isQuickClassroomModalOpen.value = false;
  quickClassroomError.value = '';
  quickClassroomForm.value = {
    name: '',
    building: '',
    capacity: 30,
    type: 'Aula Teórica'
  };
}

async function submitQuickClassroom() {
  quickClassroomError.value = '';
  const name = String(quickClassroomForm.value.name || '').trim();
  const building = String(quickClassroomForm.value.building || '').trim();
  const capacity = Number(quickClassroomForm.value.capacity);
  const type = String(quickClassroomForm.value.type || '').trim();

  const capacityCheck = quickClassroomCapacityRules[0](capacity);
  if (capacityCheck !== true) {
    quickClassroomError.value = capacityCheck;
    return null;
  }

  if (!name || !building || !type) {
    quickClassroomError.value = 'Todos los campos del aula son obligatorios.';
    return null;
  }

  savingQuickClassroom.value = true;
  try {
    const res = await api.post('/classrooms', { name, building, capacity, type });
    const createdClassroom = res.data;

    // 1. Inyectar la nueva aula en el arreglo local de opciones
    classrooms.value.push(createdClassroom);

    // 2. Asignar automáticamente el identificador de la nueva aula al modelo del selector principal
    newSchedule.value.classroom_id = createdClassroom.id;

    // 3. Actualizar reactivamente el campo de cupo (max_students) con el aforo del aula recién creada
    newSchedule.value.max_students = Number(createdClassroom.capacity);

    // 4. Cerrar el modal secundario y resetear sus campos
    closeQuickClassroomModal();

    snackbar.value = {
      show: true,
      text: `Aula "${createdClassroom.name}" creada y seleccionada automáticamente`,
      color: 'success'
    };

    return createdClassroom;
  } catch (err) {
    quickClassroomError.value = err.response?.data?.error || 'Error al registrar el aula.';
    return null;
  } finally {
    savingQuickClassroom.value = false;
  }
}

const newSchedule = ref({
  subject_id: '',
  teacher_id: '',
  classroom_id: '',
  day_of_week: 'Lunes',
  start_time: '08:00',
  end_time: '10:00',
  max_students: 30,
  group_code: 'G1',
  session_type: 'Clase Teórica'
});

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
});

onMounted(async () => {
  await loadData();
});

async function loadData() {
  try {
    const [schedRes, subRes, teachRes, classRes] = await Promise.all([
      api.get('/schedules/coordinator'),
      api.get('/subjects'),
      api.get('/teachers'),
      api.get('/classrooms')
    ]);
    schedules.value = schedRes.data;
    subjects.value = subRes.data;
    teachers.value = teachRes.data;
    classrooms.value = classRes.data;
  } catch (err) {
    console.error('Error al cargar datos del coordinador:', err);
  }
}

function getSchedulesByDay(day) {
  return filteredSchedules.value.filter(s => s.day_of_week === day);
}

function normalizeSearchText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function filterSubjects(valueText, queryText, item) {
  if (!queryText) return true;
  const q = normalizeSearchText(queryText);
  const raw = item?.raw || item || {};
  const name = normalizeSearchText(raw.name || valueText);
  const code = normalizeSearchText(raw.code);
  return name.includes(q) || code.includes(q);
}

function filterTeachers(valueText, queryText, item) {
  if (!queryText) return true;
  const q = normalizeSearchText(queryText);
  const raw = item?.raw || item || {};
  const name = normalizeSearchText(raw.name || valueText);
  const email = normalizeSearchText(raw.email);
  const identifier = normalizeSearchText(raw.identifier);
  return name.includes(q) || email.includes(q) || identifier.includes(q);
}

function openCreateDialog() {
  conflictError.value = '';
  newSchedule.value = {
    subject_id: null,
    teacher_id: null,
    classroom_id: classrooms.value.length > 0 ? classrooms.value[0].id : null,
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '10:00',
    max_students: classrooms.value.length > 0 ? classrooms.value[0].capacity : 30,
    group_code: 'G1',
    session_type: 'Clase Teórica'
  };
  createDialog.value = true;
}

async function submitSchedule() {
  if (isCapacityExceeded.value) {
    conflictError.value = capacityWarningMessage.value;
    return;
  }
  if (isLabMismatch.value) {
    conflictError.value = labMismatchWarningMessage.value;
    return;
  }
  conflictError.value = '';
  submitting.value = true;
  try {
    await api.post('/schedules', newSchedule.value);
    snackbar.value = {
      show: true,
      text: '¡Horario creado exitosamente sin conflictos!',
      color: 'success'
    };
    createDialog.value = false;
    await loadData();
  } catch (err) {
    if (err.response?.status === 409) {
      conflictError.value = err.response.data.error;
    } else {
      conflictError.value = err.response?.data?.error || 'Error al guardar el horario.';
    }
  } finally {
    submitting.value = false;
  }
}

async function handleDeleteSchedule(id) {
  if (!confirm('¿Deseas eliminar este horario programado?')) return;
  try {
    await api.delete(`/schedules/${id}`);
    snackbar.value = {
      show: true,
      text: 'Horario eliminado correctamente',
      color: 'info'
    };
    await loadData();
  } catch (err) {
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Error al eliminar horario',
      color: 'error'
    };
  }
}

function handleUploadSuccess(data) {
  snackbar.value = {
    show: true,
    text: data?.message || '¡Archivo Excel recibido correctamente!',
    color: 'success'
  };
  loadData();
}

// ==================== CATÁLOGO DE MATERIAS (TAREA 3778) ====================
const searchSubjectText = ref('');
const subjectDialog = ref(false);
const isEditingSubject = ref(false);
const savingSubject = ref(false);
const subjectError = ref('');
const subjectForm = ref({
  id: '',
  code: '',
  name: '',
  credits: 4
});

const deleteSubjectDialog = ref(false);
const subjectToDelete = ref(null);
const deletingSubject = ref(false);

const subjectCreditsRules = [
  v => {
    if (v === undefined || v === null || v === '') return 'Los créditos son obligatorios';
    const num = Number(v);
    if (!Number.isInteger(num) || num < 1 || num > 20) {
      return 'Los créditos deben ser un número entero entre 1 y 20';
    }
    return true;
  }
];

function onSubjectCodeInput(event) {
  const val = event?.target?.value !== undefined ? event.target.value : (typeof event === 'string' ? event : '');
  subjectForm.value.code = val.toUpperCase();
}

watch(() => subjectForm.value.code, (newVal) => {
  if (typeof newVal === 'string') {
    const upper = newVal.toUpperCase();
    if (newVal !== upper) {
      subjectForm.value.code = upper;
    }
  }
});

function getSubjectAssignedGroups(sub) {
  if (!sub) return 0;
  if (sub.assigned_groups !== undefined && sub.assigned_groups !== null) {
    return Number(sub.assigned_groups);
  }
  if (sub.assigned_groups_count !== undefined && sub.assigned_groups_count !== null) {
    return Number(sub.assigned_groups_count);
  }
  return schedules.value.filter(s => s.subject_id === sub.id).length;
}

const filteredSubjectsList = computed(() => {
  if (!searchSubjectText.value) return subjects.value;
  const q = normalizeSearchText(searchSubjectText.value);
  return subjects.value.filter(s => {
    const code = normalizeSearchText(s.code || s.codigo);
    const name = normalizeSearchText(s.name || s.nombre);
    return code.includes(q) || name.includes(q);
  });
});

function openNewSubjectDialog() {
  isEditingSubject.value = false;
  subjectError.value = '';
  subjectForm.value = {
    id: '',
    code: '',
    name: '',
    credits: 4
  };
  subjectDialog.value = true;
}

function openEditSubjectDialog(sub) {
  isEditingSubject.value = true;
  subjectError.value = '';
  subjectForm.value = {
    id: sub.id,
    code: (sub.code || sub.codigo || '').toUpperCase(),
    name: sub.name || sub.nombre || '',
    credits: sub.credits ?? sub.creditos ?? 4
  };
  subjectDialog.value = true;
}

function closeSubjectDialog() {
  subjectDialog.value = false;
  subjectError.value = '';
  subjectForm.value = {
    id: '',
    code: '',
    name: '',
    credits: 4
  };
}

async function saveSubject() {
  subjectError.value = '';
  const code = String(subjectForm.value.code || '').trim().toUpperCase();
  const name = String(subjectForm.value.name || '').trim();
  const credits = Number(subjectForm.value.credits);

  if (!code || !name) {
    subjectError.value = 'Código y nombre de materia son requeridos.';
    return;
  }

  const check = subjectCreditsRules[0](credits);
  if (check !== true) {
    subjectError.value = check;
    return;
  }

  savingSubject.value = true;
  try {
    if (isEditingSubject.value) {
      const res = await api.put(`/subjects/${subjectForm.value.id}`, { code, name, credits });
      const updated = res.data;
      const idx = subjects.value.findIndex(s => s.id === updated.id);
      if (idx !== -1) {
        subjects.value[idx] = {
          ...subjects.value[idx],
          ...updated,
          code: updated.code,
          name: updated.name,
          credits: updated.credits,
          codigo: updated.code,
          nombre: updated.name,
          creditos: updated.credits
        };
      }
      snackbar.value = {
        show: true,
        text: 'Materia actualizada exitosamente',
        color: 'success'
      };
    } else {
      const res = await api.post('/subjects', { code, name, credits });
      const created = res.data;
      subjects.value.push({
        ...created,
        assigned_groups: 0,
        assigned_groups_count: 0,
        codigo: created.code,
        nombre: created.name,
        creditos: created.credits
      });
      subjects.value.sort((a, b) => {
        const cA = String(a.code || a.codigo || '');
        const cB = String(b.code || b.codigo || '');
        const cCmp = cA.localeCompare(cB);
        if (cCmp !== 0) return cCmp;
        return String(a.name || a.nombre || '').localeCompare(String(b.name || b.nombre || ''));
      });
      snackbar.value = {
        show: true,
        text: 'Materia registrada exitosamente',
        color: 'success'
      };
    }
    closeSubjectDialog();
  } catch (err) {
    if (err.response?.status === 409) {
      subjectError.value = err.response.data?.error || 'Ya existe una materia con ese código en esta institución';
    } else {
      subjectError.value = err.response?.data?.error || 'Error al procesar la materia';
    }
  } finally {
    savingSubject.value = false;
  }
}

function confirmDeleteSubject(subject) {
  subjectToDelete.value = subject;
  deleteSubjectDialog.value = true;
}

function closeDeleteSubjectDialog() {
  deleteSubjectDialog.value = false;
  subjectToDelete.value = null;
}

async function executeDeleteSubject() {
  if (!subjectToDelete.value) return;
  const target = subjectToDelete.value;
  deletingSubject.value = true;
  try {
    await api.delete(`/subjects/${target.id}`);
    subjects.value = subjects.value.filter(s => s.id !== target.id);
    snackbar.value = {
      show: true,
      text: 'Materia eliminada exitosamente',
      color: 'success'
    };
    closeDeleteSubjectDialog();
  } catch (err) {
    closeDeleteSubjectDialog();
    const errorMsg = err.response?.data?.error || 'No se pudo eliminar la materia';
    snackbar.value = {
      show: true,
      text: errorMsg,
      color: 'error'
    };
  } finally {
    deletingSubject.value = false;
  }
}
</script>

<style>
@media print {
  .v-app-bar,
  .v-navigation-drawer,
  .v-footer,
  .v-btn,
  .v-alert,
  .v-tabs,
  .border-b,
  .v-select,
  .no-print {
    display: none !important;
  }

  body,
  .v-application,
  .v-main,
  .v-container {
    background: #ffffff !important;
    background-color: #ffffff !important;
    color: #000000 !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .v-card {
    box-shadow: none !important;
    border: 1px solid #ddd !important;
    background: #ffffff !important;
    break-inside: avoid;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
