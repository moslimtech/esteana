package com.esteana.noor.settings

import android.app.DatePickerDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.esteana.noor.data.GenderOption
import com.esteana.noor.data.JobOption
import com.esteana.noor.data.NotificationFrequency
import com.esteana.noor.data.OsnGeocoding
import com.esteana.noor.data.UserSettings
import com.esteana.noor.di.LocalSettingsRepository
import com.esteana.noor.ui.components.CurrentLocationRow
import com.esteana.noor.ui.components.EsteanaCard
import com.esteana.noor.ui.components.EsteanaSectionTitle
import com.esteana.noor.ui.components.EsteanaSwitchRow
import com.esteana.noor.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    onNavigateToHome: () -> Unit = {},
    onSyncNotificationPrefs: (enabled: Boolean, frequencyHours: Int) -> Unit = { _, _ -> }
) {
    val context = LocalContext.current
    val repository = LocalSettingsRepository.current
    val settings by repository.settings.collectAsState(initial = UserSettings())
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    var currentLocation by remember { mutableStateOf(Pair(30.04, 31.23)) }
    var placeName by remember { mutableStateOf<String?>(null) }
    var locationRefreshing by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        currentLocation = repository.getCurrentLatLon()
        placeName = OsnGeocoding.getPlaceName(currentLocation.first, currentLocation.second)
    }

    fun refreshLocation() {
        scope.launch {
            locationRefreshing = true
            currentLocation = repository.requestFreshLocation()
            placeName = withContext(Dispatchers.IO) {
                OsnGeocoding.getPlaceName(currentLocation.first, currentLocation.second)
            }
            locationRefreshing = false
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp)
    ) {
        FilledTonalButton(
            onClick = onNavigateToHome,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Filled.Home, contentDescription = null, modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.size(8.dp))
            Text("الرئيسية — العودة للصفحة الرئيسية")
        }
        Spacer(modifier = Modifier.height(20.dp))
        EsteanaSectionTitle(text = "الموقع")
        CurrentLocationRow(
            lat = currentLocation.first,
            lon = currentLocation.second,
            placeName = placeName,
            onRefresh = { refreshLocation() },
            refreshing = locationRefreshing,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(16.dp))
        EsteanaSectionTitle(text = "تاريخ الميلاد")
        DateOfBirthCard(
            birthDate = settings.birthDate,
            onSelectDate = { scope.launch { repository.setBirthDate(it) } }
        )

        Spacer(modifier = Modifier.height(16.dp))
        EsteanaSectionTitle(text = "الوظيفة")
        JobSelectionCard(
            selectedJob = settings.job,
            onJobSelected = { scope.launch { repository.setJob(it) } }
        )

        Spacer(modifier = Modifier.height(16.dp))
        EsteanaSectionTitle(text = "الجنس")
        GenderSelectionCard(
            selectedGender = settings.gender,
            onGenderSelected = { scope.launch { repository.setGender(it) } }
        )

        Spacer(modifier = Modifier.height(16.dp))
        EsteanaSectionTitle(text = "ضبط التنبيهات")
        EsteanaSwitchRow(
            title = "تفعيل الإشعارات",
            subtitle = "وضع الصامت الليلي (11 مساءً - 5 صباحاً) يُطبّق تلقائياً من الـ API",
            checked = settings.notificationsEnabled,
            onCheckedChange = { scope.launch { repository.setNotificationsEnabled(it) } }
        )

        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "تردد التنبيهات",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp)
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            NotificationFrequency.entries.forEach { freq ->
                FilterChip(
                    selected = settings.notificationFrequency == freq,
                    onClick = { scope.launch { repository.setNotificationFrequency(freq) } },
                    label = { Text(freq.labelAr) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        EsteanaSectionTitle(text = "عن التطبيق")
        TextButton(
            onClick = {
                val url = context.getString(R.string.privacy_policy_url)
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try {
                    context.startActivity(Intent.createChooser(intent, "فتح سياسة الخصوصية"))
                } catch (e: ActivityNotFoundException) {
                    Toast.makeText(context, "لا يوجد تطبيق لفتح الرابط", Toast.LENGTH_SHORT).show()
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Filled.Description, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.size(8.dp))
            Text("سياسة الخصوصية")
        }

        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = {
                scope.launch {
                    repository.syncToApi(settings)
                    onSyncNotificationPrefs(settings.notificationsEnabled, settings.notificationFrequency.hours)
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("حفظ وإرسال الإعدادات للـ API")
        }
    }
}

@Composable
private fun DateOfBirthCard(
    birthDate: LocalDate?,
    onSelectDate: (LocalDate?) -> Unit
) {
    val context = LocalContext.current
    val formatter = DateTimeFormatter.ofPattern("yyyy/MM/dd", Locale.forLanguageTag("ar"))

    EsteanaCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    val initial = birthDate ?: LocalDate.now().minusYears(25)
                    DatePickerDialog(
                        context,
                        { _, y, m, d -> onSelectDate(LocalDate.of(y, m + 1, d)) },
                        initial.year,
                        initial.monthValue - 1,
                        initial.dayOfMonth
                    ).show()
                }
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = birthDate?.format(formatter) ?: "اختر تاريخ الميلاد",
                style = MaterialTheme.typography.bodyLarge,
                color = if (birthDate != null) MaterialTheme.colorScheme.onSurface
                else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        birthDate?.let { date ->
            val age = UserSettings(birthDate = date).calculatedAge()
            if (age != null) {
                Text(
                    text = "العمر: $age سنة",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun JobSelectionCard(
    selectedJob: JobOption,
    onJobSelected: (JobOption) -> Unit
) {
    EsteanaCard {
        JobOption.entries.forEach { job ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(
                        selected = selectedJob == job,
                        onClick = { onJobSelected(job) }
                    )
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                RadioButton(
                    selected = selectedJob == job,
                    onClick = { onJobSelected(job) }
                )
                Text(
                    text = job.labelAr,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun GenderSelectionCard(
    selectedGender: GenderOption,
    onGenderSelected: (GenderOption) -> Unit
) {
    EsteanaCard {
        GenderOption.entries.forEach { gender ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(
                        selected = selectedGender == gender,
                        onClick = { onGenderSelected(gender) }
                    )
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                RadioButton(
                    selected = selectedGender == gender,
                    onClick = { onGenderSelected(gender) }
                )
                Text(
                    text = gender.labelAr,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}
