package kz.kzhome.pilot;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Objects;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "HomeSecureStore")
public class HomeSecureStore extends Plugin {
    private static final String ALIAS = "kz.kzhome.pilot.home.v1.";
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;

    private SharedPreferences encrypted() {
        return getContext().getSharedPreferences("kzhome.vault.v1", Context.MODE_PRIVATE);
    }

    private static String key(PluginCall call) {
        String key = call.getString("key");
        if (!Objects.equals(key, "home") && !Objects.equals(key, "refresh")) {
            throw new IllegalArgumentException("Unsupported vault entry");
        }
        return key;
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return store;
    }

    private static SecretKey secret(String key, boolean create) throws Exception {
        String alias = ALIAS + key;
        KeyStore store = keyStore();
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        if (!create) throw new IllegalStateException("Vault key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private static void fail(PluginCall call) {
        // Never expose ciphertext, plaintext or a device-specific exception.
        call.reject("Protected storage unavailable", "VAULT_UNAVAILABLE");
    }

    @PluginMethod
    public synchronized void write(PluginCall call) {
        try {
            String key = key(call);
            String value = call.getString("value");
            if (value == null || value.length() > 8192) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secret(key, true));
            cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            if (iv.length != IV_BYTES) throw new IllegalStateException();
            String encoded = Base64.encodeToString(ByteBuffer.allocate(1 + iv.length + ciphertext.length)
                    .put((byte) 1).put(iv).put(ciphertext).array(), Base64.NO_WRAP);
            if (!encrypted().edit().putString(key, encoded).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception ignored) { fail(call); }
    }

    private void access(PluginCall call, boolean consume) {
        try {
            String key = key(call);
            // A rotating refresh token may only leave native storage via a destructive take.
            if (consume != key.equals("refresh")) throw new IllegalArgumentException();
            String encoded = encrypted().getString(key, null);
            JSObject out = new JSObject();
            if (encoded != null) {
                if (consume && !encrypted().edit().remove(key).commit()) throw new IllegalStateException();
                ByteBuffer input = ByteBuffer.wrap(Base64.decode(encoded, Base64.NO_WRAP));
                if (input.remaining() <= 1 + IV_BYTES || input.get() != 1) throw new IllegalArgumentException();
                byte[] iv = new byte[IV_BYTES];
                input.get(iv);
                byte[] ciphertext = new byte[input.remaining()];
                input.get(ciphertext);
                Cipher cipher = Cipher.getInstance(ALGORITHM);
                cipher.init(Cipher.DECRYPT_MODE, secret(key, false), new GCMParameterSpec(128, iv));
                cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
                out.put("value", new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
            }
            call.resolve(out);
        } catch (Exception ignored) { fail(call); }
    }

    @PluginMethod public synchronized void read(PluginCall call) { access(call, false); }
    @PluginMethod public synchronized void take(PluginCall call) { access(call, true); }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        try {
            String key = key(call);
            // Key removal first also invalidates any previous encrypted disk copy.
            keyStore().deleteEntry(ALIAS + key);
            if (!encrypted().edit().remove(key).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception ignored) { fail(call); }
    }
}
