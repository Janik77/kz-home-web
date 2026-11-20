package kz.kzhome.pilot;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HomeSecureStore.class);
        super.onCreate(savedInstanceState);
    }
}
