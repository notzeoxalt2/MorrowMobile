package com.streamvault.app.features.settings

import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Modifier
import com.streamvault.app.features.addons.AddonsSettingsPageContent

internal fun LazyListScope.addonsSettingsContent() {
    item {
        AddonsSettingsPageContent(
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
