package com.streamvault.app.features.downloads

import android.util.AtomicFile
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements

/** Android's rename replaces an existing file; File.renameTo on Windows does not. */
@Implements(AtomicFile::class)
class AtomicFileRenameShadow {
    companion object {
        @JvmStatic
        @Implementation(minSdk = 30)
        fun rename(source: File, target: File) {
            Files.move(source.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }
}
