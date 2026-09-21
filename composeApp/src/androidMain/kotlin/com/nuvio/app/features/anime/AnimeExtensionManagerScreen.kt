package com.streamvault.app.features.anime

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.streamvault.aniyomi.AvailableExtension
import com.streamvault.aniyomi.ExtensionApi
import com.streamvault.aniyomi.ExtensionManager
import com.streamvault.aniyomi.ExtensionManagerState
import kotlinx.coroutines.launch

// StreamVault brand colors
private val VaultPrimary = Color(0xFF6C3FE8)
private val VaultBackground = Color(0xFF0D0D14)
private val VaultSurface = Color(0xFF17172A)
private val VaultOnSurface = Color(0xFFE0E0FF)
private val VaultMuted = Color(0xFF8888AA)

@Composable
fun AnimeExtensionManagerScreen(
    onBack: () -> Unit = {},
) {
    val context = LocalContext.current
    val extensionManager = remember { ExtensionManager(context) }
    val state by extensionManager.state.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()

    var availableExtensions by remember { mutableStateOf<List<AvailableExtension>>(emptyList()) }
    var isLoadingAvailable by remember { mutableStateOf(false) }
    var availableError by remember { mutableStateOf<String?>(null) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedTab by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        isLoadingAvailable = true
        try {
            availableExtensions = ExtensionApi.fetchExtensions()
        } catch (e: Exception) {
            availableError = e.message
        } finally {
            isLoadingAvailable = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VaultBackground)
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.Default.PlayArrow, // back arrow
                    contentDescription = "Back",
                    tint = VaultOnSurface
                )
            }
            Column {
                Text(
                    text = "Anime Sources",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = VaultOnSurface,
                )
                Text(
                    text = "Install Aniyomi-compatible extensions",
                    fontSize = 12.sp,
                    color = VaultMuted,
                )
            }
        }

        // Search bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search extensions...", color = VaultMuted) },
            leadingIcon = {
                Icon(Icons.Default.Search, contentDescription = null, tint = VaultMuted)
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = VaultPrimary,
                unfocusedBorderColor = VaultSurface,
                focusedTextColor = VaultOnSurface,
                unfocusedTextColor = VaultOnSurface,
                cursorColor = VaultPrimary,
                focusedContainerColor = VaultSurface,
                unfocusedContainerColor = VaultSurface,
            ),
            shape = RoundedCornerShape(12.dp),
            singleLine = true,
        )

        // Tabs: Installed | Browse
        TabRow(
            selectedTabIndex = selectedTab,
            containerColor = VaultBackground,
            contentColor = VaultPrimary,
            modifier = Modifier.padding(horizontal = 16.dp),
        ) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = {
                    Text(
                        "Installed",
                        color = if (selectedTab == 0) VaultPrimary else VaultMuted,
                    )
                }
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = {
                    Text(
                        "Browse",
                        color = if (selectedTab == 1) VaultPrimary else VaultMuted,
                    )
                }
            )
        }

        Spacer(Modifier.height(8.dp))

        when (selectedTab) {
            0 -> InstalledExtensionsTab(state = state, searchQuery = searchQuery)
            1 -> BrowseExtensionsTab(
                extensions = availableExtensions,
                isLoading = isLoadingAvailable,
                error = availableError,
                searchQuery = searchQuery,
                onRefresh = {
                    coroutineScope.launch {
                        isLoadingAvailable = true
                        availableError = null
                        try {
                            availableExtensions = ExtensionApi.fetchExtensions()
                        } catch (e: Exception) {
                            availableError = e.message
                        } finally {
                            isLoadingAvailable = false
                        }
                    }
                }
            )
        }
    }
}

@Composable
private fun InstalledExtensionsTab(
    state: ExtensionManagerState,
    searchQuery: String,
) {
    when (state) {
        is ExtensionManagerState.Loading -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = VaultPrimary)
            }
        }
        is ExtensionManagerState.Error -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Error loading extensions: ${state.exception.message}", color = Color.Red)
            }
        }
        is ExtensionManagerState.Loaded -> {
            val filtered = if (searchQuery.isBlank()) state.extensions
            else state.extensions.filter { it.name.contains(searchQuery, ignoreCase = true) }

            if (filtered.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📦", fontSize = 48.sp)
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "No extensions installed",
                            color = VaultMuted,
                            fontSize = 16.sp
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Browse the catalogue to install anime sources",
                            color = VaultMuted,
                            fontSize = 13.sp
                        )
                    }
                }
            } else {
                LazyColumn {
                    items(filtered, key = { it.pkgName }) { ext ->
                        ExtensionRow(
                            name = ext.name,
                            info = "${ext.sources.size} source(s) · v${ext.versionName}",
                            badge = "Installed",
                            badgeColor = Color(0xFF2ECC71),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BrowseExtensionsTab(
    extensions: List<AvailableExtension>,
    isLoading: Boolean,
    error: String?,
    searchQuery: String,
    onRefresh: () -> Unit,
) {
    if (isLoading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = VaultPrimary)
                Spacer(Modifier.height(12.dp))
                Text("Fetching extension catalogue...", color = VaultMuted)
            }
        }
        return
    }

    if (error != null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Failed to load catalogue", color = Color.Red)
                Spacer(Modifier.height(8.dp))
                Button(onClick = onRefresh, colors = ButtonDefaults.buttonColors(containerColor = VaultPrimary)) {
                    Text("Retry")
                }
            }
        }
        return
    }

    val filtered = if (searchQuery.isBlank()) extensions
    else extensions.filter { it.name.contains(searchQuery, ignoreCase = true) ||
        it.lang.contains(searchQuery, ignoreCase = true) }

    val byLang = filtered.groupBy { it.lang }.toSortedMap()

    LazyColumn(contentPadding = PaddingValues(bottom = 80.dp)) {
        byLang.forEach { (lang, exts) ->
            item(key = "header_$lang") {
                Text(
                    text = lang.uppercase(),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = VaultMuted,
                    letterSpacing = 1.sp,
                )
            }
            items(exts, key = { it.pkgName }) { ext ->
                ExtensionRow(
                    name = ext.name,
                    info = "${ext.sources.size} source(s) · v${ext.versionName}",
                    badge = if (ext.nsfw) "18+" else null,
                    badgeColor = Color(0xFFE74C3C),
                    trailingContent = {
                        IconButton(onClick = {
                            // In a real build, this would trigger APK download + install
                        }) {
                            Icon(
                                Icons.Default.Download,
                                contentDescription = "Install ${ext.name}",
                                tint = VaultPrimary,
                            )
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun ExtensionRow(
    name: String,
    info: String,
    badge: String? = null,
    badgeColor: Color = VaultPrimary,
    trailingContent: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Extension icon placeholder
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(VaultSurface),
            contentAlignment = Alignment.Center,
        ) {
            Text("🎬", fontSize = 22.sp)
        }

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = VaultOnSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (badge != null) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(badgeColor.copy(alpha = 0.2f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(badge, fontSize = 10.sp, color = badgeColor, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Text(
                text = info,
                fontSize = 12.sp,
                color = VaultMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        trailingContent?.invoke()
    }
}
